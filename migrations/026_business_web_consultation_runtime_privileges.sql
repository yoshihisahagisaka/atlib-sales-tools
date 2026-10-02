DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_web_consultation_leads TO sales_tools_runtime;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sales_tools_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE business_web_consultation_leads TO sales_tools_app;
  END IF;
END
$$;
