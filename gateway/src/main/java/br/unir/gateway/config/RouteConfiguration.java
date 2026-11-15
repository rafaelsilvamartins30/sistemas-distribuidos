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

    @Bean
    public RouterFunction<ServerResponse> webBffRoute() {
        return GatewayRouterFunctions.route("web-bff")
                .route(RequestPredicates.GET("/api/v1/me"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/users"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/me"), HandlerFunctions.http())
                .before(BeforeFilterFunctions.uri(this.webBffUrl)).build();
    }
}
