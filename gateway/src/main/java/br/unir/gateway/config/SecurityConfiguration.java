package br.unir.gateway.config;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
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
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfiguration {

    @Value("${WEB_ORIGIN:http://localhost:15173}")
    private String webOrigin;

    @Value("${ADMIN_WEB_ORIGIN:http://localhost:15175}")
    private String adminWebOrigin;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http.cors(cors -> cors.configurationSource(this.corsConfigurationSource())).csrf(
                AbstractHttpConfigurer::disable).sessionManagement(
                        session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests.requestMatchers(HttpMethod.GET, "/api/v1/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/users")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/university", "/api/v1/web/semesters",
                                "/api/v1/web/semesters/*", "/api/v1/web/departments", "/api/v1/web/academic-units",
                                "/api/v1/web/academic-units/*", "/api/v1/web/courses", "/api/v1/web/courses/*",
                                "/api/v1/web/departments/*", "/api/v1/web/entities", "/api/v1/web/entities/*",
                                "/api/v1/web/communities", "/api/v1/web/communities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/web/university", "/api/v1/web/academic-units/*",
                                "/api/v1/web/courses/*", "/api/v1/web/departments/*", "/api/v1/web/entities/*",
                                "/api/v1/web/communities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/academic-units", "/api/v1/web/courses",
                                "/api/v1/web/departments")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/feed", "/api/v1/web/profiles/*/*/posts",
                                "/api/v1/web/communities/*/space/posts", "/api/v1/web/community-space-posts/*/comments",
                                "/api/v1/web/follows", "/api/v1/web/notifications", "/api/v1/web/requests/me",
                                "/api/v1/web/requests/pending")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/profiles/*/*/posts",
                                "/api/v1/web/communities/*/space/posts", "/api/v1/web/community-space-posts/*/comments",
                                "/api/v1/web/polls/*/votes", "/api/v1/web/follows",
                                "/api/v1/web/notifications/read-all", "/api/v1/web/notifications/*/read",
                                "/api/v1/web/requests", "/api/v1/web/requests/*/approve",
                                "/api/v1/web/requests/*/reject")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/web/follows/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/events", "/api/v1/web/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/events")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/web/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/web/events/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/rag/query")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/opportunities", "/api/v1/web/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/opportunities")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/web/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/web/opportunities/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/professor-verification-requests",
                                "/api/v1/web/professor-verification-requests/*/approve",
                                "/api/v1/web/professor-verification-requests/*/reject")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/professor-verification-requests/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/departments/*/professor-verification-requests")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/sports", "/api/v1/web/sports/*",
                                "/api/v1/web/competitions", "/api/v1/web/competitions/*", "/api/v1/web/seasons",
                                "/api/v1/web/seasons/*", "/api/v1/web/sports-events/me",
                                "/api/v1/web/sports-events/*/*/overview", "/api/v1/web/sports-matches/me",
                                "/api/v1/web/payments/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/sports", "/api/v1/web/competitions",
                                "/api/v1/web/seasons", "/api/v1/web/sports-events/*/*/teams",
                                "/api/v1/web/sports-events/*/*/free-agents",
                                "/api/v1/web/sports-events/*/*/matches/generate",
                                "/api/v1/web/sports-matches/*/checkin-token", "/api/v1/web/sports-matches/*/checkins",
                                "/api/v1/web/payments/*/confirm")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/web/sports-matches/*/score")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/events/*/registrations")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/me/activities")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.DELETE, "/api/v1/web/registrations/*")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/attendance/me")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/attendance/check-ins")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/web/me/tickets")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.POST, "/api/v1/web/attendance/events/*/qr",
                                "/api/v1/web/attendance/tickets/*/qr",
                                "/api/v1/web/attendance/organizer-check-ins/preview",
                                "/api/v1/web/attendance/organizer-check-ins/confirm")
                        .hasAnyRole(GlobalRoles.USER, GlobalRoles.PLATFORM_ADMIN)
                        .requestMatchers(HttpMethod.GET, "/api/v1/admin/me").hasRole(GlobalRoles.PLATFORM_ADMIN)
                        .anyRequest().denyAll())
                .oauth2ResourceServer(resourceServer -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(this.jwtAuthenticationConverter())))
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration webConfiguration = new CorsConfiguration();
        webConfiguration.setAllowedOrigins(List.of(this.webOrigin));
        webConfiguration.setAllowedMethods(List.of("GET", "POST", "PATCH", "DELETE", "OPTIONS"));
        webConfiguration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        CorsConfiguration adminConfiguration = new CorsConfiguration();
        adminConfiguration.setAllowedOrigins(List.of(this.adminWebOrigin));
        adminConfiguration.setAllowedMethods(List.of("GET", "OPTIONS"));
        adminConfiguration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        CorsConfiguration adminOverviewConfiguration = new CorsConfiguration();
        adminOverviewConfiguration.setAllowedOrigins(List.of(this.webOrigin, this.adminWebOrigin));
        adminOverviewConfiguration.setAllowedMethods(List.of("GET", "OPTIONS"));
        adminOverviewConfiguration.setAllowedHeaders(List.of("Authorization", "Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // The administration dashboard reads these four public Campus summaries
        // through the Web BFF; keep its browser access limited to those GETs.
        source.registerCorsConfiguration("/api/v1/web/university", adminOverviewConfiguration);
        source.registerCorsConfiguration("/api/v1/web/departments", adminOverviewConfiguration);
        source.registerCorsConfiguration("/api/v1/web/entities", adminOverviewConfiguration);
        source.registerCorsConfiguration("/api/v1/web/communities", adminOverviewConfiguration);
        source.registerCorsConfiguration("/api/v1/me", webConfiguration);
        source.registerCorsConfiguration("/api/v1/users", webConfiguration);
        source.registerCorsConfiguration("/api/v1/web/**", webConfiguration);
        source.registerCorsConfiguration("/api/v1/admin/me", adminConfiguration);
        return source;
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
