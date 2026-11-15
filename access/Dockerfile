FROM rust:1.85.0-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src
RUN cargo build --locked --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/access /app/access
EXPOSE 8080
ENTRYPOINT ["/app/access"]
