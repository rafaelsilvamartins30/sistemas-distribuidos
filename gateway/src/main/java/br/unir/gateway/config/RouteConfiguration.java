package br.unir.gateway.config;

import static org.springframework.cloud.gateway.server.mvc.filter.BeforeFilterFunctions.uri;
import static org.springframework.cloud.gateway.server.mvc.handler.GatewayRouterFunctions.route;
import static org.springframework.cloud.gateway.server.mvc.handler.HandlerFunctions.http;
import static org.springframework.web.servlet.function.RequestPredicates.GET;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;

@Configuration
public class RouteConfiguration {

    @Value("${WEB_BFF_URL:http://localhost:18083}")
    private String webBffUrl;

    @Bean
    public RouterFunction<ServerResponse> webBffRoute() {
        return route("web-bff-me").route(GET("/api/v1/me"), http()).before(uri(this.webBffUrl)).build();
    }
}
