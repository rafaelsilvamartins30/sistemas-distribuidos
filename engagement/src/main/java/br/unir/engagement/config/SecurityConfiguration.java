package br.unir.engagement.config;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityConfiguration {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http.csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.requestMatchers(HttpMethod.GET, "/health").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/events", "/api/v1/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/events")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/opportunities", "/api/v1/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/opportunities")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/sports", "/api/v1/sports/*", "/api/v1/competitions",
                                "/api/v1/competitions/*", "/api/v1/seasons", "/api/v1/seasons/*",
                                "/api/v1/sports-events/me", "/api/v1/sports-events/*/*/overview",
                                "/api/v1/sports-matches/me", "/api/v1/sports-matches/*/attendance",
                                "/api/v1/sports-payment-origins/me", "/api/v1/payment-references/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/sports", "/api/v1/competitions", "/api/v1/seasons",
                                "/api/v1/sports-events/*/*/teams", "/api/v1/sports-events/*/*/teams/join",
                                "/api/v1/sports-events/*/*/free-agents", "/api/v1/sports-events/*/*/matches/generate",
                                "/api/v1/sports-events/*/*/cancel", "/api/v1/sports-matches/*/checkin-token",
                                "/api/v1/sports-matches/*/checkins", "/api/v1/sports-matches/*/attendance")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/sports-matches/*/score",
                                "/api/v1/sports-events/*/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/events/*/registrations")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/registrations/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/registrations/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN).anyRequest().denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(this.jwtAuthenticationConverter())))
                .build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter scopeAuthorities = new JwtGrantedAuthoritiesConverter();
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Collection<GrantedAuthority> authorities = new ArrayList<>(scopeAuthorities.convert(jwt));
            Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
            if (realmAccess != null && realmAccess.get("roles") instanceof List<?> roles) {
                for (Object role : roles) {
                    if (GlobalRoles.USER.equals(role) || GlobalRoles.PLATFORM_ADMIN.equals(role)) {
                        authorities.add(new SimpleGrantedAuthority("ROLE_" + role));
                    }
                }
            }
            return authorities;
        });
        return converter;
    }
}
