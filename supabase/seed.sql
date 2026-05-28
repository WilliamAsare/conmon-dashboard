-- ============================================================
-- ConMon Dashboard — Walkthrough Seed Data
-- Run once in Supabase SQL Editor (service role bypasses RLS).
-- Requires: all 8 migrations applied, at least one auth signup.
-- ============================================================

DO $$
DECLARE
  v_org_id   uuid;
  v_user_id  uuid;

  -- System IDs
  v_sys_cgp  uuid := gen_random_uuid();
  v_sys_anp  uuid := gen_random_uuid();
  v_sys_dsp  uuid := gen_random_uuid();

  -- Scan IDs
  v_scan_cgp_os  uuid := gen_random_uuid();
  v_scan_cgp_web uuid := gen_random_uuid();
  v_scan_anp_os  uuid := gen_random_uuid();

  -- Finding IDs
  v_f1   uuid := gen_random_uuid(); -- CGP High   (OpenSSL RCE)        OVERDUE
  v_f2   uuid := gen_random_uuid(); -- CGP High   (Untrusted Cert)     OVERDUE
  v_f3   uuid := gen_random_uuid(); -- CGP Mod    (SMB Signing)        OK
  v_f4   uuid := gen_random_uuid(); -- CGP Mod    (SSH KEX)            WARNING
  v_f5   uuid := gen_random_uuid(); -- CGP Mod    (TLS 1.0)            remediated
  v_f6   uuid := gen_random_uuid(); -- CGP Low    (Weak Ciphers)       OK
  v_f7   uuid := gen_random_uuid(); -- CGP Info   (CPE)
  v_f8   uuid := gen_random_uuid(); -- ANP High   (Log4Shell)          OVERDUE
  v_f9   uuid := gen_random_uuid(); -- ANP Mod    (SWEET32)            OK
  v_f10  uuid := gen_random_uuid(); -- CGP Web High (SQL Injection)    deviation_pending

  -- POA&M IDs (needed for deviation_requests FK)
  v_p1   uuid := gen_random_uuid();
  v_p2   uuid := gen_random_uuid();
  v_p3   uuid := gen_random_uuid();
  v_p4   uuid := gen_random_uuid();
  v_p5   uuid := gen_random_uuid();
  v_p6   uuid := gen_random_uuid();
  v_p7   uuid := gen_random_uuid();

BEGIN
  -- Pull org + user created at signup
  SELECT id INTO v_org_id   FROM organizations  LIMIT 1;
  SELECT id INTO v_user_id  FROM public.users   LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found — sign up first, then re-run.';
  END IF;

  -- ──────────────────────────────────────────────────────────
  -- 1. SYSTEMS
  -- ──────────────────────────────────────────────────────────
  INSERT INTO systems
    (id, organization_id, name, short_code, fedramp_level,
     authorization_date, ato_expiration, agency_sponsor, status)
  VALUES
    (v_sys_cgp, v_org_id, 'CloudGov Portal',    'CGP', 'High',
     '2023-03-15', '2026-03-15', 'Dept. of Homeland Security', 'active'),
    (v_sys_anp, v_org_id, 'Analytics Platform', 'ANP', 'Moderate',
     '2024-01-10', '2027-01-10', 'Dept. of Commerce',          'active'),
    (v_sys_dsp, v_org_id, 'DevSecOps Platform', 'DSP', 'Moderate',
     NULL,         NULL,         NULL,                          'active');

  -- ──────────────────────────────────────────────────────────
  -- 2. SCANS
  -- ──────────────────────────────────────────────────────────
  INSERT INTO scans
    (id, system_id, scan_type, scanner_name, scan_date, total_findings, uploaded_by)
  VALUES
    (v_scan_cgp_os,  v_sys_cgp, 'os',     'Tenable Nessus 10.6', '2026-05-01', 7, v_user_id),
    (v_scan_cgp_web, v_sys_cgp, 'webapp', 'OWASP ZAP 2.14',      '2026-05-03', 1, v_user_id),
    (v_scan_anp_os,  v_sys_anp, 'os',     'Tenable Nessus 10.6', '2026-05-10', 2, v_user_id);

  -- ──────────────────────────────────────────────────────────
  -- 3. FINDINGS
  -- SLA reference (today = 2026-05-28):
  --   High  30d  overdue: identified <= 2026-04-28
  --   Mod   90d  overdue: identified <= 2026-02-27
  --         90d  warning: identified 2026-03-01..2026-03-07 (0-7 days left)
  --   Low  180d  OK:      identified >= 2025-12-01
  -- ──────────────────────────────────────────────────────────
  INSERT INTO findings
    (id, scan_id, system_id, plugin_id, title, description,
     cvss_score, severity, affected_asset,
     first_detected, last_detected, status, control_ids)
  VALUES
    -- HIGH · OVERDUE  (identified 2026-04-01 → deadline 2026-05-01)
    (v_f1, v_scan_cgp_os, v_sys_cgp,
     '97993',
     'OpenSSL < 3.0.8 Multiple Vulnerabilities (CVE-2023-0215)',
     'OpenSSL prior to 3.0.8 is affected by a buffer overflow in BIO_read_ex() '
     'and use-after-free in d2i_PKCS7. Allows remote code execution.',
     9.8, 'high', '10.0.1.42 (cgp-web-01)',
     '2026-04-01', '2026-05-01', 'open', ARRAY['SC-8','SI-2','SI-3']),

    -- HIGH · OVERDUE  (identified 2026-03-15 → deadline 2026-04-14)
    (v_f2, v_scan_cgp_os, v_sys_cgp,
     '51192',
     'SSL Certificate Cannot Be Trusted',
     'Server X.509 certificate chain contains a self-signed root not in common trust stores. '
     'All clients receive a browser certificate warning.',
     7.5, 'high', '10.0.1.42 (cgp-web-01)',
     '2026-03-15', '2026-05-01', 'open', ARRAY['SC-8','IA-5']),

    -- MOD · OK  (identified 2026-04-15 → deadline 2026-07-14, +47d)
    (v_f3, v_scan_cgp_os, v_sys_cgp,
     '57608',
     'SMB Signing Not Required',
     'SMB signing is not enforced on the domain controller. Enables man-in-the-middle attacks.',
     5.9, 'moderate', '10.0.1.55 (cgp-dc-01)',
     '2026-04-15', '2026-05-01', 'open', ARRAY['SC-8','AC-17']),

    -- MOD · WARNING  (identified 2026-03-01 → deadline 2026-05-30, +2d)
    (v_f4, v_scan_cgp_os, v_sys_cgp,
     '10381',
     'SSH Weak Key Exchange Algorithms Enabled',
     'sshd allows diffie-hellman-group1-sha1 and diffie-hellman-group14-sha1. '
     'Attacker can downgrade to a weaker cipher suite.',
     5.3, 'moderate', '10.0.1.42 (cgp-web-01)',
     '2026-03-01', '2026-05-01', 'open', ARRAY['SC-8','IA-7']),

    -- MOD · REMEDIATED
    (v_f5, v_scan_cgp_os, v_sys_cgp,
     '104743',
     'TLS Version 1.0 Protocol Detection',
     'Service accepted TLS 1.0. Vulnerable to POODLE and BEAST. '
     'Disabled 2026-04-10 via emergency change SCR-2026-004.',
     5.0, 'moderate', '10.0.1.42 (cgp-web-01)',
     '2026-02-01', '2026-04-10', 'remediated', ARRAY['SC-8']),

    -- LOW · OK  (identified 2026-04-01 → deadline 2026-09-28, +123d)
    (v_f6, v_scan_cgp_os, v_sys_cgp,
     '26928',
     'SSL Weak Cipher Suites Supported (RC4 / 3DES)',
     'RC4 and 3DES cipher suites are enabled. Subject to SWEET32 birthday attack.',
     4.3, 'low', '10.0.1.110 (cgp-db-01)',
     '2026-04-01', '2026-05-01', 'open', ARRAY['SC-8']),

    -- INFORMATIONAL
    (v_f7, v_scan_cgp_os, v_sys_cgp,
     '45590',
     'Common Platform Enumeration (CPE) Detection',
     'Nessus enumerated CPE data from host banners. No vulnerability — recorded for inventory.',
     0.0, 'informational', '10.0.1.42 (cgp-web-01)',
     '2026-05-01', '2026-05-01', 'open', ARRAY[]::text[]),

    -- HIGH · OVERDUE (ANP Log4Shell, identified 2026-04-20 → deadline 2026-05-20, -8d)
    (v_f8, v_scan_anp_os, v_sys_anp,
     '94759',
     'Apache Log4j 2.x < 2.17.1 Remote Code Execution (Log4Shell CVE-2021-44228)',
     'Log4j 2.14.1 detected. CVE-2021-44228 allows unauthenticated RCE via JNDI injection.',
     10.0, 'high', '10.1.0.20 (anp-app-01)',
     '2026-04-20', '2026-05-10', 'open', ARRAY['SI-2','SI-3','CM-6']),

    -- MOD · OK (ANP SWEET32, identified 2026-05-01 → deadline 2026-07-30, +63d)
    (v_f9, v_scan_anp_os, v_sys_anp,
     '33851',
     'SSL Medium Strength Cipher Suites Supported (SWEET32)',
     '3DES cipher suites enabled on ANP load balancer. '
     'Vulnerable to birthday attack after ~785 GB of ciphertext.',
     5.0, 'moderate', '10.1.0.20 (anp-app-01)',
     '2026-05-01', '2026-05-10', 'open', ARRAY['SC-8']),

    -- HIGH · deviation_pending (CGP webapp SQL injection)
    (v_f10, v_scan_cgp_web, v_sys_cgp,
     'WEB-42',
     'SQL Injection in /api/reports/search',
     'The ''query'' parameter is not sanitized. Time-based blind SQL injection confirmed.',
     8.1, 'high', 'https://portal.cloudgov.example.gov/api/reports/search',
     '2026-05-03', '2026-05-03', 'deviation_pending', ARRAY['SI-10','AC-3']);

  -- ──────────────────────────────────────────────────────────
  -- 4. POA&M ITEMS
  -- poam_sequence counter updated to match inserts.
  -- sla_status / days_to_sla computed by recalculate_sla() below.
  -- ──────────────────────────────────────────────────────────
  UPDATE systems SET poam_sequence = 5 WHERE id = v_sys_cgp;
  UPDATE systems SET poam_sequence = 2 WHERE id = v_sys_anp;

  INSERT INTO poam_items
    (id, system_id, finding_id, poam_number, weakness_description,
     source, severity, identified_date, scheduled_completion, status,
     milestones, point_of_contact, resources_required, control_ids)
  VALUES
    -- V-CGP-0001 · High · OVERDUE
    (v_p1, v_sys_cgp, v_f1, 'V-CGP-0001',
     'OpenSSL < 3.0.8 on CGP web servers — remote code execution risk. '
     'Requires OS package update and coordinated maintenance window.',
     'scan', 'high', '2026-04-01', '2026-05-01', 'open',
     '[{"id":"m1","description":"Identify all affected hosts across CGP boundary","due_date":"2026-04-05","completed":true},
       {"id":"m2","description":"Test updated OpenSSL 3.0.8 package in staging","due_date":"2026-04-15","completed":true},
       {"id":"m3","description":"Deploy patched package to production (maintenance window required)","due_date":"2026-05-01","completed":false}]'::jsonb,
     'Jane Smith (Systems Engineer)',
     'RPM package update. ~2-hour maintenance window. Rollback plan documented.',
     ARRAY['SC-8','SI-2','SI-3']),

    -- V-CGP-0002 · High · OVERDUE
    (v_p2, v_sys_cgp, v_f2, 'V-CGP-0002',
     'SSL certificate on cgp-web-01 is self-signed and untrusted. '
     'Must be replaced with CA-issued certificate before next ATO review.',
     'scan', 'high', '2026-03-15', '2026-04-14', 'ongoing',
     '[{"id":"m1","description":"Submit CSR to DigiCert (approved CA)","due_date":"2026-03-20","completed":true},
       {"id":"m2","description":"Install signed certificate on cgp-web-01","due_date":"2026-04-07","completed":false},
       {"id":"m3","description":"Verify chain trust and update monitoring","due_date":"2026-04-12","completed":false}]'::jsonb,
     'Bob Chen (Network Admin)',
     'EV certificate (~$450). 30-minute maintenance window on cgp-web-01.',
     ARRAY['SC-8','IA-5']),

    -- V-CGP-0003 · Moderate · OK
    (v_p3, v_sys_cgp, v_f3, 'V-CGP-0003',
     'SMB signing not enforced on CGP domain controller. '
     'Enables MITM attacks on SMB traffic. Group Policy change required.',
     'scan', 'moderate', '2026-04-15', '2026-07-14', 'open',
     '[{"id":"m1","description":"Draft GPO change — RequireSecuritySignature=1","due_date":"2026-05-15","completed":false},
       {"id":"m2","description":"Test GPO in dev OU, validate no legacy clients break","due_date":"2026-06-01","completed":false},
       {"id":"m3","description":"Deploy GPO organization-wide and verify","due_date":"2026-07-01","completed":false}]'::jsonb,
     'Bob Chen (Network Admin)',
     'Group Policy update only. No downtime expected. Possible impact to legacy clients.',
     ARRAY['SC-8','AC-17']),

    -- V-CGP-0004 · Moderate · WARNING (deadline 2026-05-30 = 2 days away)
    (v_p4, v_sys_cgp, v_f4, 'V-CGP-0004',
     'SSH weak key exchange algorithms enabled on CGP web servers. '
     'Must restrict sshd_config to ecdh-sha2-nistp256 and curve25519-sha256.',
     'scan', 'moderate', '2026-03-01', '2026-05-30', 'open',
     '[{"id":"m1","description":"Update /etc/ssh/sshd_config on all CGP hosts and restart sshd","due_date":"2026-05-28","completed":false}]'::jsonb,
     'Jane Smith (Systems Engineer)',
     'Config change only. ~5 min SSH service restart per host.',
     ARRAY['SC-8','IA-7']),

    -- V-CGP-0005 · Low · OK
    (v_p5, v_sys_cgp, v_f6, 'V-CGP-0005',
     'RC4 and 3DES cipher suites enabled on database server TLS stack. '
     'Disable in OpenSSL config to satisfy FedRAMP SC-8.',
     'scan', 'low', '2026-04-01', '2026-09-28', 'open',
     '[]'::jsonb,
     'Alice Johnson (DBA)',
     'OpenSSL cipherlist update on cgp-db-01. No downtime expected.',
     ARRAY['SC-8']),

    -- V-ANP-0001 · High · OVERDUE (Log4Shell)
    (v_p6, v_sys_anp, v_f8, 'V-ANP-0001',
     'Apache Log4j 2.14.1 on ANP application servers — Log4Shell (CVE-2021-44228). '
     'Critical unauthenticated RCE via JNDI injection in log messages.',
     'scan', 'high', '2026-04-20', '2026-05-20', 'open',
     '[{"id":"m1","description":"Identify all Log4j usages in ANP codebase and dependencies","due_date":"2026-04-22","completed":true},
       {"id":"m2","description":"Update Log4j to 2.17.1+ in Maven/Gradle files","due_date":"2026-05-05","completed":true},
       {"id":"m3","description":"Rebuild artifacts and redeploy to anp-app-01 / anp-app-02","due_date":"2026-05-20","completed":false}]'::jsonb,
     'Marcus Lee (Dev Lead)',
     'Dependency update + full regression suite + deployment pipeline (~4 hrs).',
     ARRAY['SI-2','SI-3','CM-6']),

    -- V-ANP-0002 · Moderate · OK
    (v_p7, v_sys_anp, v_f9, 'V-ANP-0002',
     'SWEET32 — 3DES cipher suites enabled on ANP load balancer TLS termination.',
     'scan', 'moderate', '2026-05-01', '2026-07-30', 'open',
     '[]'::jsonb,
     'Marcus Lee (Dev Lead)',
     'TLS cipher suite update on AWS ALB listener configuration.',
     ARRAY['SC-8']);

  -- ──────────────────────────────────────────────────────────
  -- 5. DEVIATION REQUEST  (Operational Requirement on V-CGP-0001)
  -- ──────────────────────────────────────────────────────────
  INSERT INTO deviation_requests
    (organization_id, poam_id, deviation_type, justification,
     requested_by, status, review_notes)
  VALUES
    (v_org_id, v_p1, 'OR',
     '{"summary":"Emergency OR — OpenSSL patch postponed due to ongoing FedRAMP boundary re-authorization. Risk mitigated by WAF rule at perimeter blocking CVE-2023-0215 signatures.",
       "risk_mitigation":"Palo Alto WAF rule FED-2023-0215 active since 2026-04-03. Zero successful exploit attempts in SIEM over 57-day observation window.",
       "expected_resolution":"2026-06-30 after boundary re-authorization completes."}'::jsonb,
     v_user_id, 'submitted', NULL);

  -- ──────────────────────────────────────────────────────────
  -- 6. ASSESSMENTS
  -- ──────────────────────────────────────────────────────────
  INSERT INTO assessments
    (system_id, organization_id, assessment_type, assessor_name,
     status, planned_start, planned_end, actual_start, actual_end,
     findings_count, report_url, notes, created_by)
  VALUES
    -- Completed annual 3PAO (CGP)
    (v_sys_cgp, v_org_id, 'annual', 'Coalfire Systems Inc.',
     'completed',
     '2025-11-01', '2025-12-15', '2025-11-04', '2025-12-12', 14,
     'https://docs.example.gov/sar/cgp-2025-annual.pdf',
     'Annual assessment complete. 14 findings: 2 High, 7 Moderate, 5 Low. '
     'SAR submitted to FedRAMP PMO on 2025-12-18.',
     v_user_id),

    -- Focused · in_progress (CGP region migration)
    (v_sys_cgp, v_org_id, 'focused', 'Coalfire Systems Inc.',
     'in_progress',
     '2026-05-15', '2026-06-15', '2026-05-16', NULL, 0,
     NULL,
     'Focused assessment for significant change: migration of cgp-web-01/02 to us-gov-east-1. '
     'Scope limited to SC family controls and boundary documentation.',
     v_user_id),

    -- Annual · planned (ANP)
    (v_sys_anp, v_org_id, 'annual', 'Kratos Defense & Security Solutions',
     'planned',
     '2026-08-01', '2026-09-30', NULL, NULL, 0,
     NULL,
     'Annual 3PAO assessment scheduled. SOW under legal review. '
     'Assessor kickoff call tentatively set for 2026-07-15.',
     v_user_id),

    -- Significant change · completed (ANP ML pipeline)
    (v_sys_anp, v_org_id, 'significant_change', 'Kratos Defense & Security Solutions',
     'completed',
     '2026-02-01', '2026-03-01', '2026-02-03', '2026-02-28', 3,
     NULL,
     'Significant change: new ML inference pipeline added to ANP boundary. '
     '3 low-severity findings. All accepted as risk accepted by agency ISSO.',
     v_user_id);

  -- ──────────────────────────────────────────────────────────
  -- 7. INCIDENTS
  -- ──────────────────────────────────────────────────────────
  INSERT INTO incidents
    (system_id, organization_id, title, description, severity, status,
     detected_at, reported_at, contained_at, resolved_at,
     affected_controls, reported_by, notes)
  VALUES
    -- Resolved · brute force · within IR-6 SLA (35 min to report)
    (v_sys_cgp, v_org_id,
     'SSH Brute-Force Attack on cgp-web-01',
     'Automated brute-force from 203.0.113.44 against port 22. '
     '847 failed logins in 12 minutes. No successful authentications.',
     'moderate', 'resolved',
     '2026-05-10 14:23:00+00',
     '2026-05-10 14:58:00+00',
     '2026-05-10 15:10:00+00',
     '2026-05-10 17:30:00+00',
     ARRAY['AC-7','SI-4','IR-4'],
     v_user_id,
     'Source IP blocked at WAF. SSH key-only auth enforced. US-CERT notified.'),

    -- Investigating · insider threat · within SLA (32 min)
    (v_sys_anp, v_org_id,
     'Anomalous Data Export — Possible Compromised Service Account',
     'DLP alert: service account anp_svc_etl exported 4.2 GB of PII records '
     'to an unapproved external S3 bucket. No human operator should have triggered this.',
     'high', 'investigating',
     '2026-05-27 09:15:00+00',
     '2026-05-27 09:47:00+00',
     NULL, NULL,
     ARRAY['AC-4','AC-6','AU-9','IR-4','SI-4'],
     v_user_id,
     'Account suspended. Forensic log review in progress. '
     'CloudTrail analysis requested. Agency CISO and US-CERT notified.'),

    -- Open · cert expiry · within SLA (41 min)
    (v_sys_dsp, v_org_id,
     'TLS Certificate Expiring in 3 Days — dsp-ci-01',
     'Certificate monitor detected cert for dsp-ci-01 expires 2026-05-31. '
     'Not renewed in last quarterly rotation.',
     'low', 'open',
     '2026-05-28 06:00:00+00',
     '2026-05-28 06:41:00+00',
     NULL, NULL,
     ARRAY['SC-8','CM-6'],
     v_user_id,
     'ACME DNS-01 challenge failed — token not propagated. Manual renewal initiated.');

  -- ──────────────────────────────────────────────────────────
  -- 8. INVENTORY ITEMS
  -- ──────────────────────────────────────────────────────────
  INSERT INTO inventory_items
    (system_id, organization_id, item_type, name, vendor, version,
     asset_tag, ip_address, mac_address, os_name, status, notes)
  VALUES
    (v_sys_cgp, v_org_id, 'hardware', 'Web Server 01',
     'Dell Technologies', NULL, 'CGP-SVR-001', '10.0.1.42', '00:1A:2B:3C:4D:5E',
     'RHEL 9.2', 'active', 'OpenSSL 3.0.7 — see V-CGP-0001'),
    (v_sys_cgp, v_org_id, 'hardware', 'Web Server 02',
     'Dell Technologies', NULL, 'CGP-SVR-002', '10.0.1.43', '00:1A:2B:3C:4D:5F',
     'RHEL 9.2', 'active', NULL),
    (v_sys_cgp, v_org_id, 'hardware', 'Domain Controller 01',
     'HPE', NULL, 'CGP-SVR-003', '10.0.1.55', '00:1A:2B:3C:4D:60',
     'Windows Server 2022', 'active', 'SMB signing not enforced — see V-CGP-0003'),
    (v_sys_cgp, v_org_id, 'hardware', 'Database Server 01',
     'Dell Technologies', NULL, 'CGP-SVR-004', '10.0.1.110', '00:1A:2B:3C:4D:61',
     'RHEL 9.2', 'active', NULL),
    (v_sys_cgp, v_org_id, 'hardware', 'Palo Alto WAF',
     'Palo Alto Networks', NULL, 'CGP-NET-001', '10.0.1.1', NULL,
     NULL, 'active', 'FED-2023-0215 rule active'),

    (v_sys_anp, v_org_id, 'hardware', 'App Server 01 (EC2)',
     'AWS', NULL, 'ANP-EC2-001', '10.1.0.20', NULL,
     'Amazon Linux 2023', 'active', 'Log4j 2.14.1 — see V-ANP-0001'),
    (v_sys_anp, v_org_id, 'hardware', 'App Server 02 (EC2)',
     'AWS', NULL, 'ANP-EC2-002', '10.1.0.21', NULL,
     'Amazon Linux 2023', 'active', NULL),
    (v_sys_anp, v_org_id, 'hardware', 'RDS PostgreSQL Instance',
     'AWS', NULL, 'ANP-RDS-001', '10.1.0.50', NULL,
     NULL, 'active', 'Multi-AZ. AES-256 at rest. 35-day backup retention.'),

    (v_sys_dsp, v_org_id, 'hardware', 'CI/CD Runner 01',
     'AWS', NULL, 'DSP-EC2-001', '10.2.0.10', NULL,
     'Ubuntu 22.04 LTS', 'active', 'TLS cert expires 2026-05-31 — see open incident'),

    (v_sys_cgp, v_org_id, 'software', 'Apache HTTP Server',
     'Apache Software Foundation', '2.4.57', NULL, NULL, NULL, NULL,
     'active', 'CGP-SVR-001, CGP-SVR-002'),
    (v_sys_cgp, v_org_id, 'software', 'PostgreSQL',
     'PostgreSQL Global Development Group', '15.4', NULL, NULL, NULL, NULL,
     'active', 'CGP-SVR-004'),
    (v_sys_cgp, v_org_id, 'software', 'OpenSSL',
     'OpenSSL Project', '3.0.7', NULL, NULL, NULL, NULL,
     'active', 'VULNERABLE — CVE-2023-0215. See V-CGP-0001'),
    (v_sys_cgp, v_org_id, 'software', 'Red Hat Enterprise Linux',
     'Red Hat', '9.2', NULL, NULL, NULL, NULL, 'active', NULL),

    (v_sys_anp, v_org_id, 'software', 'Apache Log4j',
     'Apache Software Foundation', '2.14.1', NULL, NULL, NULL, NULL,
     'active', 'VULNERABLE — CVE-2021-44228 (Log4Shell). See V-ANP-0001'),
    (v_sys_anp, v_org_id, 'software', 'Apache Spark',
     'Apache Software Foundation', '3.4.1', NULL, NULL, NULL, NULL,
     'active', NULL),
    (v_sys_anp, v_org_id, 'software', 'Python',
     'Python Software Foundation', '3.11.4', NULL, NULL, NULL, NULL,
     'active', NULL);

  -- ──────────────────────────────────────────────────────────
  -- 9. Recompute SLA for all open POA&Ms
  -- ──────────────────────────────────────────────────────────
  PERFORM recalculate_sla();

  RAISE NOTICE 'Seed data inserted. Org: %, User: %', v_org_id, v_user_id;
END $$;
