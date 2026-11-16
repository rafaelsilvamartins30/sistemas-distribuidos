use access::{
    attendance::{issue_event_qr_token, run_consumer},
    auth::JwtVerifier,
    http_api, Config,
};
use sqlx::postgres::PgPoolOptions;
use std::{env, error::Error, process::ExitCode};
use tokio::task::JoinHandle;
use uuid::Uuid;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Access failed to start: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn Error>> {
    let config = Config::from_env();
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    let database_url = env::var("DB_URL").unwrap_or_else(|_| {
        "postgres://unir:unir-local-only@localhost:15436/unir_access".to_string()
    });
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await?;
    MIGRATOR.run(&pool).await?;

    if arguments
        .first()
        .is_some_and(|argument| argument == "issue-qr")
    {
        let event_id = arguments
            .get(1)
            .ok_or("usage: access issue-qr <event-id>")?
            .parse::<Uuid>()?;
        if arguments.len() != 2 {
            return Err("usage: access issue-qr <event-id>".into());
        }
        let token = issue_event_qr_token(&pool, event_id).await?;
        print_qr(&token)?;
        return Ok(());
    }
    if !arguments.is_empty() {
        return Err(
            "unknown command; use `access issue-qr <event-id>` or start without arguments".into(),
        );
    }

    let rabbitmq_url = rabbitmq_url_from_env();
    let consumer_pool = pool.clone();
    let consumer: JoinHandle<()> = tokio::spawn(async move {
        run_consumer(consumer_pool, rabbitmq_url).await;
    });
    let issuer = env::var("KEYCLOAK_ISSUER_URI")
        .unwrap_or_else(|_| "http://localhost:18081/realms/unir".to_string());
    let jwks_uri = env::var("KEYCLOAK_JWK_SET_URI").unwrap_or_else(|_| {
        "http://localhost:18081/realms/unir/protocol/openid-connect/certs".to_string()
    });
    let verifier = JwtVerifier::new(issuer, jwks_uri);
    let listen_addr = config.listen_addr;
    let http_pool = pool.clone();
    let http_server =
        tokio::spawn(async move { http_api::serve(&listen_addr, http_pool, verifier).await });

    tokio::select! {
        result = http_server => result??,
        result = consumer => result?,
    }
    Ok(())
}

fn print_qr(token: &str) -> Result<(), Box<dyn Error>> {
    let qr = qrcodegen::QrCode::encode_text(token, qrcodegen::QrCodeEcc::Medium)?;
    println!("QR token issued. It is stored as a hash and valid only during the event window.");
    for y in -2..qr.size() + 2 {
        for x in -2..qr.size() + 2 {
            let black = x >= 0 && y >= 0 && x < qr.size() && y < qr.size() && qr.get_module(x, y);
            print!("{}", if black { "██" } else { "  " });
        }
        println!();
    }
    Ok(())
}

fn rabbitmq_url_from_env() -> String {
    if let Ok(url) = env::var("RABBITMQ_URL") {
        return url;
    }
    let host = env::var("RABBITMQ_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = env::var("RABBITMQ_PORT").unwrap_or_else(|_| "5672".to_string());
    let username = env::var("RABBITMQ_USERNAME").unwrap_or_else(|_| "unir".to_string());
    let password = env::var("RABBITMQ_PASSWORD").unwrap_or_else(|_| "unir-local-only".to_string());
    format!(
        "amqp://{}:{}@{host}:{port}/%2f",
        encode_user_info(&username),
        encode_user_info(&password)
    )
}

fn encode_user_info(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::encode_user_info;

    #[test]
    fn amqp_credentials_are_url_encoded() {
        assert_eq!(encode_user_info("unir@example"), "unir%40example");
        assert_eq!(encode_user_info("pass word/1"), "pass%20word%2F1");
    }
}
