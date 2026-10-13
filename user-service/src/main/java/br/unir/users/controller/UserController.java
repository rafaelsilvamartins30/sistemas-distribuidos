package br.unir.users.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import br.unir.users.dto.CreateUserRequest;
import br.unir.users.dto.CreateUserResponse;
import br.unir.users.dto.GetUserResponse;
import br.unir.users.dto.UpdateUserRequest;
import br.unir.users.service.UserService;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<CreateUserResponse> create(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(this.userService.create(userId(jwt), request));
    }

    @GetMapping("/me")
    public GetUserResponse getMe(@AuthenticationPrincipal Jwt jwt) {
        return this.userService.getMe(userId(jwt), jwt.getClaimAsString("email"), jwt.getClaim("email_verified"));
    }

    @PatchMapping("/me")
    public GetUserResponse updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateUserRequest request) {
        return this.userService.updateMe(userId(jwt), request, jwt.getClaimAsString("email"),
                jwt.getClaim("email_verified"));
    }

    private String userId(Jwt jwt) {
        if (jwt.getSubject() == null || jwt.getSubject().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token subject is required");
        }
        return jwt.getSubject();
    }
}
