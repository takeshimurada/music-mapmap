#!/bin/bash
# Pipeline Safe Runner - 에러가 나도 백업 보장

echo "🚀 Pipeline Safe Runner"
echo "========================"

# 시작 전 백업 (현재 상태 보존)
echo ""
echo "📦 Step 0: Pre-pipeline backup..."
npm run db:backup || echo "⚠️ Pre-backup failed, continuing..."

# Pipeline 실행 (에러 캡처)
echo ""
echo "🔄 Running pipeline..."
PIPELINE_EXIT_CODE=0
npm run pipeline:cleanup && \
npm run fetch:spotify && \
npm run pipeline:all && \
npm run fetch:metadata && \
npm run metadata:import || PIPELINE_EXIT_CODE=$?

# 항상 백업 (성공/실패 무관)
echo ""
echo "📦 Final backup (always runs)..."
npm run db:backup || echo "⚠️ Final backup failed!"

# 결과 출력
echo ""
echo "========================"
if [ $PIPELINE_EXIT_CODE -eq 0 ]; then
    echo "✅ Pipeline completed successfully!"
else
    echo "⚠️ Pipeline failed with exit code: $PIPELINE_EXIT_CODE"
    echo "   But backup was attempted."
fi

exit $PIPELINE_EXIT_CODE
