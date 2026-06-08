use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use axum::extract::State;
use axum::Json;
use bt_domain::{Discipline, GradeBlock, GradeLevel, GradesFramework, MatrixCell};
use uuid::Uuid;

#[utoipa::path(
    get, path = "/v1/grades/framework",
    responses((status = 200, description = "Grade framework", body = GradesFramework))
)]
pub async fn get_framework(
    State(state): State<AppState>,
    axum::Extension(auth): axum::Extension<AuthUser>,
) -> AppResult<Json<GradesFramework>> {
    let ws: (Uuid,) = sqlx::query_as("SELECT workspace_id FROM users WHERE id = $1")
        .bind(auth.id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let workspace_id = ws.0;

    let levels: Vec<GradeLevel> = sqlx::query_as::<_, (
        i32, String, String, String, String, String, bool, f64, f64, f64,
    )>(
        "SELECT ord, code, name, exp, autonomy, scope, mgr, band_low, band_mid, band_high \
         FROM grade_levels WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| GradeLevel {
        ord: r.0, code: r.1, name: r.2, exp: r.3, autonomy: r.4, scope: r.5,
        mgr: r.6, band_low: r.7, band_mid: r.8, band_high: r.9,
    })
    .collect();

    let disc_rows: Vec<(Uuid, String, String, String, String, i32)> = sqlx::query_as(
        "SELECT id, key, label, icon, description, ord FROM disciplines \
         WHERE workspace_id = $1 ORDER BY ord",
    )
    .bind(workspace_id)
    .fetch_all(&state.pool).await?;
    let disc_ids: Vec<Uuid> = disc_rows.iter().map(|d| d.0).collect();

    let block_rows: Vec<(Uuid, Uuid, String, String, i32)> = sqlx::query_as(
        "SELECT id, discipline_id, key, name, ord FROM grade_blocks \
         WHERE discipline_id = ANY($1) ORDER BY ord",
    )
    .bind(&disc_ids)
    .fetch_all(&state.pool).await?;
    let block_ids: Vec<Uuid> = block_rows.iter().map(|b| b.0).collect();

    let cell_rows: Vec<(Uuid, i32, Option<String>, bool)> = sqlx::query_as(
        "SELECT block_id, level_ord, text, required FROM matrix_cells \
         WHERE block_id = ANY($1) ORDER BY level_ord",
    )
    .bind(&block_ids)
    .fetch_all(&state.pool).await?;

    // assemble nested
    let disciplines = disc_rows.into_iter().map(|d| {
        let blocks = block_rows.iter().filter(|b| b.1 == d.0).map(|b| {
            let cells = cell_rows.iter().filter(|c| c.0 == b.0)
                .map(|c| MatrixCell { level: c.1, text: c.2.clone(), required: c.3 })
                .collect();
            GradeBlock { id: b.0, key: b.2.clone(), name: b.3.clone(), ord: b.4, cells }
        }).collect();
        Discipline { id: d.0, key: d.1, label: d.2, icon: d.3, description: d.4, ord: d.5, blocks }
    }).collect();

    Ok(Json(GradesFramework { levels, disciplines }))
}

#[cfg(test)]
mod tests {
    use crate::app::{build_router, AppState};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn app(pool: sqlx::PgPool) -> axum::Router {
        build_router(AppState {
            pool,
            jwt_secret: "test-secret".into(),
            web_origin: "http://localhost:3000".into(),
            s3: crate::storage::client_from_env(),
            bucket: crate::storage::bucket_from_env(),
        })
    }

    async fn login_token(pool: &sqlx::PgPool, email: &str) -> String {
        let resp = app(pool.clone()).oneshot(
            Request::builder().method("POST").uri("/v1/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","password":"demo1234"}}"#)))
                .unwrap(),
        ).await.unwrap();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        serde_json::from_slice::<serde_json::Value>(&bytes).unwrap()["token"].as_str().unwrap().to_string()
    }

    #[sqlx::test(migrations = "../bt-db/migrations")]
    async fn framework_returns_levels_and_disciplines(pool: sqlx::PgPool) {
        bt_db::seed::seed_demo(&pool).await.unwrap();
        let token = login_token(&pool, "e.glebov@beeteam.io").await;
        let resp = app(pool).oneshot(
            Request::builder().method("GET").uri("/v1/grades/framework")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty()).unwrap(),
        ).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["levels"].as_array().unwrap().len(), 7);
        assert_eq!(json["levels"][0]["code"], "IC1");
        assert!(json["levels"][0]["band_mid"].is_number());
        let disc = json["disciplines"].as_array().unwrap();
        assert_eq!(disc.len(), 5);
        let backend = disc.iter().find(|d| d["key"] == "backend").unwrap();
        assert_eq!(backend["blocks"].as_array().unwrap().len(), 6);
        let arch = backend["blocks"].as_array().unwrap().iter().find(|b| b["key"] == "arch").unwrap();
        assert_eq!(arch["cells"].as_array().unwrap().len(), 7);
        // arch/IC1 is "Не требуется." → required=false, text null
        assert_eq!(arch["cells"][0]["required"], false);
        assert!(arch["cells"][0]["text"].is_null());
    }
}
