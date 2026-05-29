use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub mod seed;

/// Create a connection pool from `DATABASE_URL`.
pub async fn pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

/// Run all embedded migrations.
pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn migrations_apply_and_core_tables_exist(pool: PgPool) {
        let count: (i64,) = sqlx::query_as(
            "SELECT count(*) FROM information_schema.tables \
             WHERE table_schema = 'public' AND table_name IN \
             ('workspaces','users','teams','team_members','meetings', \
              'goals','files','field_templates','field_defs')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count.0, 9);
    }
}
