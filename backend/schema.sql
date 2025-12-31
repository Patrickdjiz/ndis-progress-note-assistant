--
-- PostgreSQL database dump
--

\restrict VR6WIpYWEneLElQdL1qA2fmdRtdScEGtLVfGinv76x5mAYaALu0NKvCmb2sjHVw

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: organisations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organisations (
    id integer NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organisations_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text])))
);


--
-- Name: organisations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organisations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organisations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organisations_id_seq OWNED BY public.organisations.id;


--
-- Name: progress_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progress_notes (
    id integer NOT NULL,
    organisation_id integer NOT NULL,
    worker_user_id integer NOT NULL,
    participant_name text NOT NULL,
    worker_name text NOT NULL,
    date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    location text NOT NULL,
    activities_and_supports text NOT NULL,
    participant_presentation text NOT NULL,
    goals_worked_on text NOT NULL,
    incidents_or_risks text NOT NULL,
    follow_up_actions text NOT NULL,
    note_text text NOT NULL,
    incident_flag boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    final_note_text text,
    finalised_at timestamp with time zone,
    finalised_by text,
    reviewed_flag boolean DEFAULT false NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    archived_flag boolean DEFAULT false NOT NULL,
    archived_at timestamp with time zone,
    archived_by text
);


--
-- Name: progress_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.progress_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: progress_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.progress_notes_id_seq OWNED BY public.progress_notes.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    organisation_id integer NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    full_name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    password_changed_at timestamp with time zone,
    reset_token_hash text,
    reset_token_expires_at timestamp with time zone,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'ADMIN'::text, 'WORKER'::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: organisations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisations ALTER COLUMN id SET DEFAULT nextval('public.organisations_id_seq'::regclass);


--
-- Name: progress_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_notes ALTER COLUMN id SET DEFAULT nextval('public.progress_notes_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: organisations organisations_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_name_key UNIQUE (name);


--
-- Name: organisations organisations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);


--
-- Name: progress_notes progress_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_notes
    ADD CONSTRAINT progress_notes_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_notes_org_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_org_archived ON public.progress_notes USING btree (organisation_id, archived_flag);


--
-- Name: idx_notes_org_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_org_created ON public.progress_notes USING btree (organisation_id, created_at DESC);


--
-- Name: idx_notes_org_incident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_org_incident ON public.progress_notes USING btree (organisation_id, incident_flag);


--
-- Name: idx_notes_org_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_org_participant ON public.progress_notes USING btree (organisation_id, participant_name);


--
-- Name: idx_notes_org_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_org_worker ON public.progress_notes USING btree (organisation_id, worker_user_id);


--
-- Name: idx_users_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_org ON public.users USING btree (organisation_id);



CREATE INDEX IF NOT EXISTS idx_notes_org_created_id ON progress_notes (organisation_id, created_at DESC, id DESC);


--
-- Name: progress_notes progress_notes_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_notes
    ADD CONSTRAINT progress_notes_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id);


--
-- Name: progress_notes progress_notes_worker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_notes
    ADD CONSTRAINT progress_notes_worker_user_id_fkey FOREIGN KEY (worker_user_id) REFERENCES public.users(id);


--
-- Name: users users_organisation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.organisations(id);


--
-- PostgreSQL database dump complete
--

\unrestrict VR6WIpYWEneLElQdL1qA2fmdRtdScEGtLVfGinv76x5mAYaALu0NKvCmb2sjHVw

