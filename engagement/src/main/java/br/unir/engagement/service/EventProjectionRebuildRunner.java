package br.unir.engagement.service;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "engagement.event-projection.rebuild-and-exit", havingValue = "true")
public class EventProjectionRebuildRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventProjectionRebuildRunner.class);

    private final EventProjectionRebuildService rebuildService;
    private final ConfigurableApplicationContext applicationContext;

    @SuppressFBWarnings(value = "EI_EXPOSE_REP2", justification = "Spring injects the container-managed application context")
    public EventProjectionRebuildRunner(EventProjectionRebuildService rebuildService,
            ConfigurableApplicationContext applicationContext) {
        this.rebuildService = rebuildService;
        this.applicationContext = applicationContext;
    }

    @Override
    public void run(ApplicationArguments args) {
        int rebuilt = this.rebuildService.rebuild();
        LOGGER.info("Rebuilt {} Event projections from PostgreSQL", rebuilt);
        this.applicationContext.close();
    }
}
