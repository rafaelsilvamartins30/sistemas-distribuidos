use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

const JWKS_CACHE_TTL: Duration = Duration::from_secs(300);
type CachedJwks = Arc<RwLock<Option<(Instant, Arc<JwkSet>)>>>;

#[derive(Debug)]
pub enum JwtError {
    Unauthorized,
    Forbidden,
    Unavailable,
}

#[derive(Clone)]
pub struct JwtVerifier {
    client: reqwest::Client,
    issuer: String,
    jwks_uri: String,
    cached_jwks: CachedJwks,
}

#[derive(Debug, Deserialize)]
struct Claims {
    sub: String,
    #[serde(default)]
    realm_access: RealmAccess,
}

#[derive(Debug, Default, Deserialize)]
struct RealmAccess {
    #[serde(default)]
    roles: Vec<String>,
}

impl JwtVerifier {
    #[must_use]
    pub fn new(issuer: String, jwks_uri: String) -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(3))
                .build()
                .expect("valid reqwest client configuration"),
            issuer,
            jwks_uri,
            cached_jwks: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn verify_subject(&self, token: &str) -> Result<String, JwtError> {
        let header = decode_header(token).map_err(|_| JwtError::Unauthorized)?;
        if header.alg != Algorithm::RS256 {
            return Err(JwtError::Unauthorized);
        }
        let kid = header.kid.as_deref().ok_or(JwtError::Unauthorized)?;
        let jwk = self.jwk_for(kid).await?;
        let key = DecodingKey::from_jwk(&jwk).map_err(|_| JwtError::Unauthorized)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        // The Gateway validates technical claims; this domain service verifies issuer/signature/expiry
        // and does not impose an audience that the existing Keycloak client contract does not define.
        validation.validate_aud = false;
        let claims = decode::<Claims>(token, &key, &validation)
            .map_err(|_| JwtError::Unauthorized)?
            .claims;
        if claims.sub.trim().is_empty() || claims.sub.len() > 255 {
            return Err(JwtError::Unauthorized);
        }
        if !claims
            .realm_access
            .roles
            .iter()
            .any(|role| role == "USER" || role == "PLATFORM_ADMIN")
        {
            return Err(JwtError::Forbidden);
        }
        Ok(claims.sub)
    }

    async fn jwk_for(&self, kid: &str) -> Result<jsonwebtoken::jwk::Jwk, JwtError> {
        let cached = self
            .cached_jwks
            .read()
            .ok()
            .and_then(|cache| cache.clone())
            .filter(|(fetched_at, _)| fetched_at.elapsed() < JWKS_CACHE_TTL);
        if let Some((_, jwks)) = &cached {
            if let Some(jwk) = jwks.find(kid) {
                return Ok(jwk.clone());
            }
        }

        let response = self
            .client
            .get(&self.jwks_uri)
            .send()
            .await
            .map_err(|_| JwtError::Unavailable)?
            .error_for_status()
            .map_err(|_| JwtError::Unavailable)?;
        let jwks = Arc::new(
            response
                .json::<JwkSet>()
                .await
                .map_err(|_| JwtError::Unavailable)?,
        );
        let key = jwks.find(kid).cloned().ok_or(JwtError::Unauthorized)?;
        if let Ok(mut cache) = self.cached_jwks.write() {
            *cache = Some((Instant::now(), jwks));
        }
        Ok(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn malformed_tokens_are_rejected_before_network_access() {
        let verifier = JwtVerifier::new(
            "http://localhost/realms/unir".to_string(),
            "http://127.0.0.1:1/jwks".to_string(),
        );
        assert!(matches!(
            verifier.verify_subject("not-a-jwt").await,
            Err(JwtError::Unauthorized)
        ));
    }
}
