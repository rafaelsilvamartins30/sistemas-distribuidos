use access::{bind_listener, handle_connection, Config};
use std::process::ExitCode;

fn main() -> ExitCode {
    let config = Config::from_env();
    let (listener, addr) = match bind_listener(&config.listen_addr) {
        Ok(bound) => bound,
        Err(error) => {
            eprintln!("failed to bind {}: {error}", config.listen_addr);
            return ExitCode::FAILURE;
        }
    };

    println!("access listening on {addr}");

    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                if let Err(error) = handle_connection(stream, &config.db_host_port) {
                    eprintln!("connection error: {error}");
                }
            }
            Err(error) => {
                eprintln!("accept error: {error}");
            }
        }
    }

    ExitCode::SUCCESS
}
