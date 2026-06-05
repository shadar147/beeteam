use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::Client;
use std::time::Duration;

const PRESIGN_EXPIRY_SECS: u64 = 900; // 15 min

/// Build an S3 client for MinIO (path-style, static creds).
pub fn build_client(endpoint: &str, region: &str, access: &str, secret: &str) -> Client {
    let creds = aws_sdk_s3::config::Credentials::new(
        access.to_string(), secret.to_string(), None, None, "static",
    );
    let conf = aws_sdk_s3::config::Builder::new()
        .endpoint_url(endpoint.to_string())
        .region(aws_sdk_s3::config::Region::new(region.to_string()))
        .credentials_provider(creds)
        .force_path_style(true)
        .build();
    Client::from_conf(conf)
}

/// Build a client from env (used by main + tests). Defaults target the dev MinIO.
pub fn client_from_env() -> Client {
    let endpoint = std::env::var("S3_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".into());
    let region = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".into());
    let access = std::env::var("S3_ACCESS_KEY").unwrap_or_else(|_| "beeteam".into());
    let secret = std::env::var("S3_SECRET_KEY").unwrap_or_else(|_| "beeteam-secret".into());
    build_client(&endpoint, &region, &access, &secret)
}

pub fn bucket_from_env() -> String {
    std::env::var("S3_BUCKET").unwrap_or_else(|_| "beeteam".into())
}

/// Create the bucket if missing. Best-effort: a "you already own it" error is fine.
pub async fn ensure_bucket(s3: &Client, bucket: &str) {
    let _ = s3.create_bucket().bucket(bucket).send().await;
}

pub async fn presign_put(s3: &Client, bucket: &str, key: &str, content_type: &str) -> String {
    let cfg = PresigningConfig::expires_in(Duration::from_secs(PRESIGN_EXPIRY_SECS))
        .expect("valid presign config");
    let req = s3.put_object().bucket(bucket).key(key).content_type(content_type)
        .presigned(cfg).await.expect("presign put");
    req.uri().to_string()
}

pub async fn presign_get(s3: &Client, bucket: &str, key: &str) -> String {
    let cfg = PresigningConfig::expires_in(Duration::from_secs(PRESIGN_EXPIRY_SECS))
        .expect("valid presign config");
    let req = s3.get_object().bucket(bucket).key(key)
        .presigned(cfg).await.expect("presign get");
    req.uri().to_string()
}

/// Best-effort delete; ignores errors (missing object / storage hiccup must not block row deletion).
pub async fn delete_object(s3: &Client, bucket: &str, key: &str) {
    let _ = s3.delete_object().bucket(bucket).key(key).send().await;
}

/// Fetch object bytes; None on any error (missing object / unreachable) so the zip can skip it.
pub async fn get_object_bytes(s3: &Client, bucket: &str, key: &str) -> Option<Vec<u8>> {
    let out = s3.get_object().bucket(bucket).key(key).send().await.ok()?;
    let data = out.body.collect().await.ok()?;
    Some(data.into_bytes().to_vec())
}

/// Map a mime/filename to the `file_kind` enum value.
pub fn kind_from_mime(mime: &str, name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if mime == "application/pdf" || lower.ends_with(".pdf") { return "pdf"; }
    if mime.starts_with("image/") { return "img"; }
    if mime.starts_with("video/") { return "video"; }
    if mime.contains("spreadsheet") || mime.contains("excel")
        || lower.ends_with(".xlsx") || lower.ends_with(".xls") || lower.ends_with(".csv") {
        return "sheet";
    }
    "doc"
}

#[cfg(test)]
mod tests {
    use super::kind_from_mime;
    #[test]
    fn maps_kinds() {
        assert_eq!(kind_from_mime("application/pdf", "x.pdf"), "pdf");
        assert_eq!(kind_from_mime("image/png", "a.png"), "img");
        assert_eq!(kind_from_mime("video/mp4", "a.mp4"), "video");
        assert_eq!(kind_from_mime("application/vnd.ms-excel", "a.xls"), "sheet");
        assert_eq!(kind_from_mime("application/octet-stream", "a.docx"), "doc");
    }
}
