package br.unir.gateway.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.server.mvc.filter.BeforeFilterFunctions;
import org.springframework.cloud.gateway.server.mvc.handler.GatewayRouterFunctions;
import org.springframework.cloud.gateway.server.mvc.handler.HandlerFunctions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.function.RequestPredicates;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;

@Configuration
public class RouteConfiguration {

    @Value("${WEB_BFF_URL:http://localhost:18083}")
    private String webBffUrl;

    @Value("${ADMIN_BFF_URL:http://admin-bff:3000}")
    private String adminBffUrl;

    @Bean
    public RouterFunction<ServerResponse> webBffRoute() {
        return GatewayRouterFunctions.route("web-bff")
                .route(RequestPredicates.GET("/api/v1/me"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/users"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/university"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/departments"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/departments/{departmentId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/entities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/entities/{entityId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/communities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/communities/{communityId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events/{eventId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/events/{eventId}/registrations"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/me/activities"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/web/registrations/{registrationId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/attendance/me"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/check-ins"), HandlerFunctions.http())
                .before(BeforeFilterFunctions.uri(this.webBffUrl)).build();
    }

    @Bean
    public RouterFunction<ServerResponse> adminBffRoute() {
        return GatewayRouterFunctions.route("admin-bff")
                .route(RequestPredicates.GET("/api/v1/admin/me"), HandlerFunctions.http())
                .before(BeforeFilterFunctions.uri(this.adminBffUrl)).build();
    }
}
