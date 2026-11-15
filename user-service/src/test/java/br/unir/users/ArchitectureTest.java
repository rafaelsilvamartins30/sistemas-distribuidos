package br.unir.users;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

class ArchitectureTest {

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("br.unir.users");

    @Test
    void controllersDoNotAccessPersistenceDetailsDirectly() {
        ArchRule rule = noClasses().that().resideInAPackage("..controller..").should().dependOnClassesThat()
                .resideInAnyPackage("..repository..", "..entity..");

        rule.check(classes);
    }

    @Test
    void entitiesDoNotDependOnApplicationLayers() {
        ArchRule rule = noClasses().that().resideInAPackage("..entity..").should().dependOnClassesThat()
                .resideInAnyPackage("..controller..", "..dto..", "..repository..", "..service..");

        rule.check(classes);
    }
}
