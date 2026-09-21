REVOKE ALL ON FUNCTION public.create_billing_collection(uuid, uuid, text, integer, jsonb, jsonb, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.register_billing_installment_payment(uuid, integer, text, text, uuid) FROM anon, authenticated;
