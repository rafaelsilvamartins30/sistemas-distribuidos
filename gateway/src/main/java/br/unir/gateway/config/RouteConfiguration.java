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
                .route(RequestPredicates.PATCH("/api/v1/web/university"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/users"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/semesters"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/semesters/{semesterId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/academic-units"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/academic-units/{unitId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/academic-units"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/academic-units/{unitId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/courses"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/courses/{courseId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/courses"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/courses/{courseId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/departments"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/departments/{departmentId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/departments"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/departments/{departmentId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/entities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/entities/{entityId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/entities/{entityId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/communities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/communities/{communityId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/communities/{communityId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events/organizer-contexts"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events/managed"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/events"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/events/{eventId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/events/{eventId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/web/events/{eventId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/rag/query"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/opportunities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/opportunities/publisher-contexts"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/opportunities/managed"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/opportunities"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/opportunities/{opportunityId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/web/opportunities/{opportunityId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/web/opportunities/{opportunityId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/professor-verification-requests"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/professor-verification-requests/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/departments/{departmentId}/professor-verification-requests"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/professor-verification-requests/{requestId}/approve"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/professor-verification-requests/{requestId}/reject"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/requests/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/requests/pending"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/requests"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/requests/{requestId}/approve"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/requests/{requestId}/reject"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/feed"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/profiles/{profileType}/{profileId}/posts"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/profiles/{profileType}/{profileId}/posts"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/communities/{communityId}/space/posts"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/communities/{communityId}/space/posts"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/community-space-posts/{postId}/comments"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/community-space-posts/{postId}/comments"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/polls/{pollId}/votes"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/follows"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/follows"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/web/follows/{followId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/notifications"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/notifications/read-all"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/notifications/{notificationId}/read"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports/organizer-contexts"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports/{sportId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/competitions"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/competitions/{competitionId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/seasons"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/seasons/{seasonId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports-events/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports-events/{contextType}/{contextId}/overview"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/sports-events/{contextType}/{contextId}/teams"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/sports-events/{contextType}/{contextId}/teams/join"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/sports-events/{contextType}/{contextId}/free-agents"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/sports-matches/me"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/sports-matches/{matchId}/checkins"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/payments/me"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/payments/{registrationId}/confirm"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/events/{eventId}/registrations"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/me/activities"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/web/registrations/{registrationId}"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/attendance/events/{eventId}/attendance-review"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/events/{eventId}/attendance-review"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/attendance/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/attendance/events/{eventId}/organizer-action"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/check-ins"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/web/me/tickets"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/events/{eventId}/qr"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/tickets/{eventId}/qr"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/organizer-check-ins/preview"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/web/attendance/organizer-check-ins/confirm"),
                        HandlerFunctions.http())
                .before(BeforeFilterFunctions.uri(this.webBffUrl)).build();
    }

    @Bean
    public RouterFunction<ServerResponse> adminBffRoute() {
        return GatewayRouterFunctions.route("admin-bff")
                .route(RequestPredicates.GET("/api/v1/admin/me"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/admin/overview"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/admin/sports-matches/{matchId}/attendance"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/sports-matches/{matchId}/attendance"),
                        HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/admin/sports/catalog"), HandlerFunctions.http())
                .route(RequestPredicates.GET("/api/v1/admin/sports-events/{contextType}/{contextId}/overview"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/sports"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/competitions"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/seasons"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/sports-events/{contextType}/{contextId}"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/sports-events/{contextType}/{contextId}/cancel"),
                        HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/sports-events/{contextType}/{contextId}/matches/generate"),
                        HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/sports-matches/{matchId}/score"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/sports-matches/{matchId}/checkin-token"),
                        HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/semesters/{semesterId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/academic-units"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/departments"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/courses"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/semesters"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/university"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/academic-units/{unitId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/departments/{departmentId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/entities/{entityId}"), HandlerFunctions.http())
                .route(RequestPredicates.PATCH("/api/v1/admin/communities/{communityId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/admin/academic-units/{unitId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/admin/departments/{departmentId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/admin/courses/{courseId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/admin/entities/{entityId}"), HandlerFunctions.http())
                .route(RequestPredicates.DELETE("/api/v1/admin/communities/{communityId}"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/requests/{requestId}/approve"), HandlerFunctions.http())
                .route(RequestPredicates.POST("/api/v1/admin/requests/{requestId}/reject"), HandlerFunctions.http())
                .before(BeforeFilterFunctions.uri(this.adminBffUrl)).build();
    }
}
