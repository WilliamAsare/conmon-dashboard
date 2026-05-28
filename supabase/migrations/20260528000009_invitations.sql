-- Migration 9: Team invitations + org management helpers
-- Enables org admins to invite team members by email.
-- The handle_new_user() trigger is updated to honour invite tokens.

-- ============================================================
-- TABLE: invitations
-- ============================================================

CREATE TABLE invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            user_role NOT NULL DEFAULT 'isso',
  token           uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at     timestamptz,

  UNIQUE (token),
  -- One pending invite per email per org (prevent spam)
  UNIQUE (organization_id, email)
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read invitations"
  ON invitations FOR SELECT
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "admin insert invitations"
  ON invitations FOR INSERT
  WITH CHECK (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "admin delete invitations"
  ON invitations FOR DELETE
  USING (
    organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'admin'
  );

CREATE INDEX ON invitations (organization_id);
CREATE INDEX ON invitations (token);
CREATE INDEX ON invitations (email);

-- ============================================================
-- FUNCTION: get_invitation_by_token
-- Called from the public invite page (no auth required).
-- Security definer so the anon key can read invitation + org name.
-- ============================================================

CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token uuid)
RETURNS TABLE (
  organization_id   uuid,
  organization_name text,
  email             text,
  role              user_role,
  expires_at        timestamptz,
  accepted_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.organization_id,
    o.name  AS organization_name,
    i.email,
    i.role,
    i.expires_at,
    i.accepted_at
  FROM invitations i
  JOIN organizations o ON o.id = i.organization_id
  WHERE i.token = p_token;
END;
$$;

-- Allow unauthenticated (anon) callers on the /invite page
GRANT EXECUTE ON FUNCTION get_invitation_by_token(uuid) TO anon, authenticated;

-- ============================================================
-- FUNCTION: get_org_members
-- Joins public.users with auth.users to expose email addresses.
-- Only accessible to authenticated members of the caller's org.
-- ============================================================

CREATE OR REPLACE FUNCTION get_org_members()
RETURNS TABLE (
  id         uuid,
  full_name  text,
  role       user_role,
  email      text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.role,
    a.email,
    u.created_at
  FROM public.users u
  JOIN auth.users a ON a.id = u.id
  WHERE u.organization_id = (
    SELECT organization_id FROM public.users WHERE id = auth.uid()
  )
  ORDER BY u.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_org_members() TO authenticated;

-- ============================================================
-- FUNCTION: update_member_role
-- Allows an admin to change another member's role.
-- ============================================================

CREATE OR REPLACE FUNCTION update_member_role(p_user_id uuid, p_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org  uuid;
  v_caller_role user_role;
  v_target_org  uuid;
BEGIN
  SELECT organization_id, role INTO v_caller_org, v_caller_role
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can change member roles';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Cannot modify a user in a different organization';
  END IF;

  UPDATE public.users SET role = p_role WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_member_role(uuid, user_role) TO authenticated;

-- ============================================================
-- FUNCTION: remove_member
-- Removes a user's profile from the org (does not delete auth.users).
-- ============================================================

CREATE OR REPLACE FUNCTION remove_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org  uuid;
  v_caller_role user_role;
  v_target_org  uuid;
BEGIN
  SELECT organization_id, role INTO v_caller_org, v_caller_role
  FROM public.users WHERE id = auth.uid();

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can remove members';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself';
  END IF;

  SELECT organization_id INTO v_target_org FROM public.users WHERE id = p_user_id;
  IF v_target_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'Cannot remove a user from a different organization';
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_member(uuid) TO authenticated;

-- ============================================================
-- FUNCTION: update_organization_name
-- ============================================================

CREATE OR REPLACE FUNCTION update_organization_name(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id  uuid;
  v_role    user_role;
BEGIN
  SELECT organization_id, role INTO v_org_id, v_role
  FROM public.users WHERE id = auth.uid();

  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can rename the organization';
  END IF;
  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Organization name cannot be blank';
  END IF;

  UPDATE organizations SET name = trim(p_name) WHERE id = v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_organization_name(text) TO authenticated;

-- ============================================================
-- UPDATE handle_new_user — check for invite token first
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       uuid;
  v_org_name     text;
  v_invite_token text;
  v_invite_role  user_role;
BEGIN
  -- Idempotency guard for re-runs
  IF EXISTS (SELECT 1 FROM public.users WHERE id = new.id) THEN
    RETURN new;
  END IF;

  v_invite_token := new.raw_user_meta_data->>'invite_token';

  IF v_invite_token IS NOT NULL THEN
    -- Find a valid, unaccepted invite whose email matches
    SELECT i.organization_id, i.role
    INTO   v_org_id, v_invite_role
    FROM   invitations i
    WHERE  i.token        = v_invite_token::uuid
      AND  lower(i.email) = lower(new.email)
      AND  i.accepted_at  IS NULL
      AND  i.expires_at   > now();

    IF FOUND THEN
      -- Mark invite consumed
      UPDATE invitations SET accepted_at = now()
      WHERE  token = v_invite_token::uuid;

      -- Create profile in the EXISTING org with the invited role
      INSERT INTO public.users (id, organization_id, role, full_name)
      VALUES (
        new.id,
        v_org_id,
        v_invite_role,
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
          split_part(new.email, '@', 1)
        )
      );
      RETURN new;
    END IF;
    -- If invite not found / expired, fall through to normal signup
  END IF;

  -- Normal signup: create a brand-new organization
  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'organization_name'), ''),
    split_part(new.email, '@', 2)
  );

  INSERT INTO organizations (name) VALUES (v_org_name) RETURNING id INTO v_org_id;

  INSERT INTO public.users (id, organization_id, role, full_name)
  VALUES (
    new.id,
    v_org_id,
    'admin',
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    )
  );

  RETURN new;

EXCEPTION
  WHEN others THEN
    RAISE EXCEPTION 'handle_new_user failed for user %: % %',
      new.id, sqlerrm, sqlstate;
END;
$$;
