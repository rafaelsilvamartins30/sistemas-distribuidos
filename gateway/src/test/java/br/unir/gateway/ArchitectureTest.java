package br.unir.gateway;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Configuration;

class ArchitectureTest {

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("br.unir.gateway");

    @Test
    void gatewayDoesNotDependOnPersistenceOrOtherServicePackages() {
        ArchRule rule = noClasses().should().dependOnClassesThat().resideInAnyPackage("..users..", "..repository..",
                "..entity..", "jakarta.persistence..", "javax.sql..", "org.springframework.jdbc..",
                "org.springframework.data..", "org.hibernate..");

        rule.check(classes);
    }

    @Test
    void configurationClassesResideInConfigPackage() {
        ArchRule rule = classes().that().areAnnotatedWith(Configuration.class).should().resideInAPackage("..config..");

        rule.check(classes);
    }
}
