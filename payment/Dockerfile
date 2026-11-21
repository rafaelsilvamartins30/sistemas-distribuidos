FROM golang:1.27-bookworm AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /payment ./cmd/payment

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /payment /app/payment
EXPOSE 8080
ENTRYPOINT ["/app/payment"]
