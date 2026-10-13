package br.unir.users.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import br.unir.users.entity.User;

public interface UserRepository extends JpaRepository<User, String> {

    boolean existsByInstitutionalId(String institutionalId);
}
