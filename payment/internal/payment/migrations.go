package payment

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
)

//go:embed migrations/001_payment_store.sql
var initialMigration string

//go:embed migrations/002_payment_refunds.sql
var refundMigration string

//go:embed migrations/003_event_cancellations.sql
var eventCancellationMigration string

//go:embed migrations/004_registration_cancellation_gate.sql
var registrationCancellationGateMigration string

// Migrate installs the initial Payment schema once. Future changes should add
// numbered migrations and advance the stored version.
func Migrate(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin payment migration: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at TIMESTAMPTZ NOT NULL
	)`); err != nil {
		return fmt.Errorf("create payment migration table: %w", err)
	}
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1)`).Scan(&exists); err != nil {
		return fmt.Errorf("read payment migration version: %w", err)
	}
	if !exists {
		if _, err := tx.ExecContext(ctx, initialMigration); err != nil {
			return fmt.Errorf("apply payment migration 1: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (1, now())`); err != nil {
			return fmt.Errorf("record payment migration 1: %w", err)
		}
	}
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 2)`).Scan(&exists); err != nil {
		return fmt.Errorf("read payment migration version 2: %w", err)
	}
	if !exists {
		if _, err := tx.ExecContext(ctx, refundMigration); err != nil {
			return fmt.Errorf("apply payment migration 2: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (2, now())`); err != nil {
			return fmt.Errorf("record payment migration 2: %w", err)
		}
	}
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 3)`).Scan(&exists); err != nil {
		return fmt.Errorf("read payment migration version 3: %w", err)
	}
	if !exists {
		if _, err := tx.ExecContext(ctx, eventCancellationMigration); err != nil {
			return fmt.Errorf("apply payment migration 3: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (3, now())`); err != nil {
			return fmt.Errorf("record payment migration 3: %w", err)
		}
	}
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 4)`).Scan(&exists); err != nil {
		return fmt.Errorf("read payment migration version 4: %w", err)
	}
	if !exists {
		if _, err := tx.ExecContext(ctx, registrationCancellationGateMigration); err != nil {
			return fmt.Errorf("apply payment migration 4: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (version, applied_at) VALUES (4, now())`); err != nil {
			return fmt.Errorf("record payment migration 4: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit payment migration: %w", err)
	}
	return nil
}
