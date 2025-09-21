gcloud run deploy ck-worker \
  --image us-east4-docker.pkg.dev/YOUR_PROJECT_ID/cloud-build-repo/ck-worker:[IMAGE_TAG_FROM_BUILD_LOGS] \
  --platform managed \
  --region us-east4 \
  --allow-unauthenticated \
  --set-env-vars="DEEPGRAM_API_KEY=YOUR_DEEPGRAM_API_KEY" \
  --session-affinity
  # ... any other flags you need