use crate::auth::middleware::AuthUser;
use crate::error::{AppError, AppResult};
use crate::app::AppState;
use axum::extract::{Path, State};
use axum::Json;
use bt_domain::{FieldDef, TemplateDetail};
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/v1/templates/{id}",
    params(("id" = uuid::Uuid, Path, description = "Template id")),
    responses(
        (status = 200, description = "Template with ordered field defs", body = TemplateDetail),
        (status = 404, description = "No such template"),
    )
)]
pub async fn get_template(
    State(state): State<AppState>,
    axum::Extension(_auth): axum::Extension<AuthUser>,
    Path(template_id): Path<Uuid>,
) -> AppResult<Json<TemplateDetail>> {
    let tpl: Option<(uuid::Uuid, String)> =
        sqlx::query_as("SELECT id, name FROM field_templates WHERE id = $1")
            .bind(template_id)
            .fetch_optional(&state.pool)
            .await?;
    let (id, name) = tpl.ok_or(AppError::NotFound)?;

    let fields: Vec<FieldDef> = sqlx::query_as::<_, (
        uuid::Uuid, i32, String, String, bool, Option<String>, Option<String>, Vec<String>,
    )>(
        "SELECT id, ord, type::text, title, required, placeholder, hint, options \
         FROM field_defs WHERE template_id = $1 ORDER BY ord",
    )
    .bind(template_id)
    .fetch_all(&state.pool).await?
    .into_iter()
    .map(|r| FieldDef {
        id: r.0, ord: r.1, kind: r.2, title: r.3, required: r.4,
        placeholder: r.5, hint: r.6, options: r.7,
    })
    .collect();

    Ok(Json(TemplateDetail { id, name, fields }))
}
