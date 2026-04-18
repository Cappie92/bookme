# Root Makefile — удобные команды для backend (master-only)
.PHONY: backend-run backend-run-legacy verify-master-canon test-master-canon config-runbook enrich-campaign-qa

# Проверки конфигурации (Runbook): prod JWT/фичи-секреты, dev stub. См. docs/CONFIG_AUDIT.md
config-runbook:
	./backend/scripts/runbook_config_check.sh

backend-run:
	cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

backend-run-legacy:
	cd backend && LEGACY_INDIE_MODE=1 python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

verify-master-canon:
	cd backend && python3 scripts/verify_master_canon.py

test-master-canon:
	cd backend && python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py -v

# Campaign QA: enrichment + verify (baseline reseed — см. WITH_RESEED=1). См. docs/CAMPAIGN_ENRICHMENT_GUIDE.md
enrich-campaign-qa:
	bash scripts/enrich_campaign_qa.sh
