package br.unir.engagement.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class CampusOpportunityPublisherClientTest {

    private HttpServer server;
    private ExecutorService executor;

    @AfterEach
    void stopServer() {
        if (this.server != null) {
            this.server.stop(0);
        }
        if (this.executor != null) {
            this.executor.shutdownNow();
        }
    }

    @Test
    @Timeout(value = 6, unit = TimeUnit.SECONDS)
    void aSlowCampusPermissionLookupFailsAsUnavailableInsteadOfCompletingLater() throws Exception {
        CountDownLatch requestReceived = new CountDownLatch(1);
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.executor = Executors.newSingleThreadExecutor(task -> {
            Thread thread = new Thread(task);
            thread.setDaemon(true);
            return thread;
        });
        this.server.setExecutor(this.executor);
        this.server.createContext("/internal/v1/opportunity-publishers", exchange -> {
            requestReceived.countDown();
            try {
                Thread.sleep(4_000);
                byte[] response = "{\"items\":[{\"publisherType\":\"DEPARTMENT\","
                        .concat("\"publisherId\":\"00000000-0000-4000-8000-000000000001\",\"name\":\"DCC\"}]}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        this.server.start();

        String campusUrl = "http://127.0.0.1:" + this.server.getAddress().getPort();
        CampusOpportunityPublisherClient client = new CampusOpportunityPublisherClient(RestClient.builder(), campusUrl);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
                () -> client.getContexts("verified-caller-token"));

        assertTrue(requestReceived.await(1, TimeUnit.SECONDS));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.getStatusCode());
    }
}
