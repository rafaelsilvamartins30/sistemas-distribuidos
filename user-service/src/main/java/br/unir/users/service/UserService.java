package br.unir.users.service;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import br.unir.users.dto.CreateUserRequest;
import br.unir.users.dto.CreateUserResponse;
import br.unir.users.dto.GetUserResponse;
import br.unir.users.dto.UpdateUserRequest;
import br.unir.users.entity.User;
import br.unir.users.repository.UserRepository;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional
    public CreateUserResponse create(String id, CreateUserRequest request) {
        if (this.userRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User already exists");
        }
        if (this.userRepository.existsByInstitutionalId(request.institutionalId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Institutional ID already exists");
        }

        List<String> interests = request.interests() == null ? List.of() : request.interests();
        User user = new User(id, request.name(), request.institutionalId(), request.course(), request.department(),
                interests);
        User saved = this.userRepository.saveAndFlush(user);
        return new CreateUserResponse(saved.getId(), saved.getName(), saved.getInstitutionalId(), saved.getCourse(),
                saved.getDepartment(), List.copyOf(saved.getInterests()), saved.getCreatedAt(), saved.getUpdatedAt());
    }

    @Transactional(readOnly = true)
    public GetUserResponse getMe(String id, String email, Boolean emailVerified) {
        User user = this.userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "UNIR user not found"));
        return new GetUserResponse(user.getId(), user.getName(), user.getInstitutionalId(), user.getCourse(),
                user.getDepartment(), List.copyOf(user.getInterests()), user.getCreatedAt(), user.getUpdatedAt(), email,
                emailVerified);
    }

    @Transactional
    public GetUserResponse updateMe(String id, UpdateUserRequest request, String email, Boolean emailVerified) {
        User user = this.userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "UNIR user not found"));
        String name = request.name() == null ? user.getName() : request.name();
        String course = request.course() == null ? user.getCourse() : request.course();
        String department = request.department() == null ? user.getDepartment() : request.department();
        List<String> interests = request.interests() == null ? user.getInterests() : request.interests();
        user.update(name, course, department, interests);
        User saved = this.userRepository.saveAndFlush(user);
        return new GetUserResponse(saved.getId(), saved.getName(), saved.getInstitutionalId(), saved.getCourse(),
                saved.getDepartment(), List.copyOf(saved.getInterests()), saved.getCreatedAt(), saved.getUpdatedAt(),
                email, emailVerified);
    }
}
