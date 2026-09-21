-- Numérotation des documents : préfixe = code entreprise CONFIGURABLE
-- (company_settings.company_code), au lieu de 'BTS' codé en dur. Repli 'BTS' si
-- absent/vide. Les numéros déjà émis ne changent pas (stockés) ; seuls les
-- nouveaux documents adoptent le code de l'entreprise → prérequis white-label.
CREATE OR REPLACE FUNCTION fn_next_document_number(
    p_office_id UUID,
    p_doc_type  document_type,
    p_year      SMALLINT DEFAULT NULL,
    p_month     SMALLINT DEFAULT NULL
) RETURNS VARCHAR LANGUAGE plpgsql AS $$
DECLARE
    v_year         SMALLINT := COALESCE(p_year,  EXTRACT(YEAR  FROM NOW())::SMALLINT);
    v_month        SMALLINT := COALESCE(p_month, EXTRACT(MONTH FROM NOW())::SMALLINT);
    v_seq          INTEGER;
    v_office_code  VARCHAR(10);
    v_doc_prefix   VARCHAR(5);
    v_company_code VARCHAR(10);
BEGIN
    SELECT code INTO STRICT v_office_code
      FROM agency_offices WHERE id = p_office_id;

    SELECT NULLIF(TRIM(company_code), '') INTO v_company_code FROM company_settings LIMIT 1;
    v_company_code := COALESCE(v_company_code, 'BTS');

    INSERT INTO document_sequences (office_id, document_type, year, month, last_sequence)
    VALUES (p_office_id, p_doc_type, v_year, v_month, 1)
    ON CONFLICT (office_id, document_type, year, month)
    DO UPDATE SET last_sequence = document_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

    v_doc_prefix := CASE p_doc_type
        WHEN 'proforma'         THEN 'pfm'
        WHEN 'invoice'          THEN 'fac'
        WHEN 'purchase_order'   THEN 'bc'
        WHEN 'supplier_invoice' THEN 'ff'
        WHEN 'expense'          THEN 'dep'
        WHEN 'delivery_note'    THEN 'bl'
        ELSE 'doc'
    END;

    RETURN format('%s/%s/%s/%s/%s%s',
        v_company_code,
        v_office_code,
        v_year,
        lpad(v_month::TEXT, 2, '0'),
        v_doc_prefix,
        lpad(v_seq::TEXT, 3, '0')
    );
END;
$$;
