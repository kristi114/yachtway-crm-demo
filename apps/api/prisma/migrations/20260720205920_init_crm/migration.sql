-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "title" TEXT,
    "department" TEXT,
    "user_role" TEXT,
    "is_active" BOOLEAN,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "owner" TEXT,
    "parent_company_id" TEXT,
    "parent_company" TEXT,
    "primary_contact_id" TEXT,
    "primary_contact" TEXT,
    "total_active_listings" DECIMAL(65,30),
    "total_number_of_brokers" DECIMAL(65,30),
    "listings_all_time" DECIMAL(65,30),
    "total_number_of_offices" DECIMAL(65,30),
    "tour_3d_views_30d" DECIMAL(65,30),
    "account_currency" TEXT,
    "company_email" TEXT,
    "name" TEXT,
    "company_source" TEXT,
    "company_status" TEXT,
    "company_type" TEXT,
    "active_customer_date" DATE,
    "api_connected" BOOLEAN,
    "api_available" BOOLEAN,
    "api_feed_info" TEXT,
    "avg_listing_photo_count" DECIMAL(65,30),
    "avg_response_minutes_30d" DECIMAL(65,30),
    "billing_city" TEXT,
    "billing_country" TEXT,
    "billing_name" TEXT,
    "billing_postal_code" TEXT,
    "billing_state" TEXT,
    "billing_street" TEXT,
    "closings_in_house" BOOLEAN,
    "company_score" DECIMAL(65,30),
    "created_by" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3),
    "dealer_logo_file" TEXT,
    "dealer_logo_url" TEXT,
    "dealer_referral_code" TEXT,
    "do_not_call" BOOLEAN,
    "easyfund_closed_referrals_amount" DECIMAL(14,2),
    "easyfund_referral_percentage_closed" DECIMAL(65,30),
    "easyfund_referrals_closed" DECIMAL(65,30),
    "easyfund_referrals_total" DECIMAL(65,30),
    "easysign_active" BOOLEAN,
    "easysign_active_date" DATE,
    "easysign_custom_pricing" DECIMAL(14,2),
    "easysign_demo_date" DATE,
    "easysign_primary_contact" TEXT,
    "easysign_primary_contact_id" TEXT,
    "easysign_subscription_type" TEXT,
    "easysign_trial_active" BOOLEAN,
    "easysign_trial_end_date" DATE,
    "easysign_trial_start_date" DATE,
    "email_opt_out" BOOLEAN,
    "first_listing_date" DATE,
    "first_signup_date" DATE,
    "has_clicked_signup_link" BOOLEAN,
    "has_requested_or_booked" BOOLEAN,
    "high_intent_flag" BOOLEAN,
    "in_house_financing" BOOLEAN,
    "is_studiopass_member" BOOLEAN,
    "last_modified_date" TIMESTAMP(3),
    "last_login" DATE,
    "listing_views_to_date" DECIMAL(65,30),
    "listing_views_all_time" DECIMAL(65,30),
    "listings_live" DECIMAL(65,30),
    "listings_live_date" DATE,
    "listings_updated_30d" DECIMAL(65,30),
    "listings_w_3d_tour" DECIMAL(65,30),
    "live_streams_done" DECIMAL(65,30),
    "main_office_city" TEXT,
    "main_office_country" TEXT,
    "main_office_postal_code" TEXT,
    "main_office_state" TEXT,
    "main_office_street" TEXT,
    "median_response_minutes_30d" DECIMAL(65,30),
    "number_of_listings_on_external_site" DECIMAL(65,30),
    "office_2_id" TEXT,
    "office_2_city" TEXT,
    "office_2_country" TEXT,
    "office_2_postal_code" TEXT,
    "office_2_state" TEXT,
    "office_2_street" TEXT,
    "office_3_id" TEXT,
    "office_3_city" TEXT,
    "office_3_country" TEXT,
    "office_3_postal_code" TEXT,
    "office_3_state" TEXT,
    "office_3_street" TEXT,
    "office_4_id" TEXT,
    "office_4_city" TEXT,
    "office_4_country" TEXT,
    "office_4_postal_code" TEXT,
    "office_4_state" TEXT,
    "office_4_street" TEXT,
    "office_2_phone" TEXT,
    "office_3_phone" TEXT,
    "office_4_phone" TEXT,
    "onboarding_complete" BOOLEAN,
    "onboarding_complete_date" DATE,
    "paid_admin_seats" DECIMAL(65,30),
    "paid_broker_seats" DECIMAL(65,30),
    "paid_offices" DECIMAL(65,30),
    "payment_method_added" BOOLEAN,
    "phone" TEXT,
    "photography_in_house" BOOLEAN,
    "playbook_upsell_targets" TEXT[],
    "signup_source" TEXT,
    "social_reach_to_date" DECIMAL(65,30),
    "sold_listings" DECIMAL(65,30),
    "total_spotlight_views_30d" DECIMAL(65,30),
    "sql_triggered_date" DATE,
    "stripe_customer_id" TEXT,
    "studio_engaged" BOOLEAN,
    "studio_engaged_date" DATE,
    "studio_engagement_lift" DECIMAL(6,3),
    "studio_spend_qtr" DECIMAL(14,2),
    "studio_spend_lifetime" DECIMAL(14,2),
    "studio_spend_ytd" DECIMAL(14,2),
    "total_amount_credited" DECIMAL(65,30),
    "total_amount_due" DECIMAL(65,30),
    "total_amount_invoiced" DECIMAL(65,30),
    "total_amount_overdue" DECIMAL(65,30),
    "total_amount_paid" DECIMAL(65,30),
    "total_draft_amount" DECIMAL(65,30),
    "total_unallocated_credit" DECIMAL(65,30),
    "free_listing_shoots_earned" DECIMAL(65,30),
    "free_listing_shoots_remaining" DECIMAL(65,30),
    "upsell_target_priority_1" TEXT,
    "upsell_target_priority_2" TEXT,
    "upsell_target_priority_3" TEXT,
    "website" TEXT,
    "website_visit_count" DECIMAL(65,30),
    "xero_contact_id" TEXT,
    "yachtway_db_account_id" TEXT,
    "yachtway_dealer_page" TEXT,
    "last_broker_signin" DECIMAL(65,30),
    "last_adminmgr_signin" DECIMAL(65,30),
    "services" TEXT,
    "sf_account_id" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "company" TEXT,
    "owner_id" TEXT,
    "owner" TEXT,
    "record_type" TEXT,
    "contact_type" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "office_phone" TEXT,
    "mobile_phone" TEXT,
    "office_street" TEXT,
    "office_city" TEXT,
    "office_state" TEXT,
    "office_country" TEXT,
    "office_postal_code" TEXT,
    "yachtway_db_id" TEXT,
    "broker_page_url" TEXT,
    "amplitude_id" TEXT,
    "amplitude_user_id" TEXT,
    "amplitude_device_id" TEXT,
    "last_login" DATE,
    "days_since_last_login" DECIMAL(65,30),
    "logins_30d" DECIMAL(65,30),
    "sessions_30d" DECIMAL(65,30),
    "avg_session_minutes_30d" DECIMAL(65,30),
    "yachtway_logins" DECIMAL(65,30),
    "last_amplitude_event" TEXT,
    "login_frequency_tier" TEXT,
    "email_opt_in" BOOLEAN,
    "sms_opt_in" BOOLEAN,
    "created_date" TIMESTAMP(3),
    "broker_image" TEXT,
    "signup_timestamp" DATE,
    "nonresponsive" BOOLEAN,
    "requested_demo" BOOLEAN,
    "first_call_date" DATE,
    "company_active" BOOLEAN,
    "invitation_status" TEXT,
    "browsing_sessions" DECIMAL(65,30),
    "active_listings" DECIMAL(65,30),
    "first_email_date" DATE,
    "last_site_visit" DATE,
    "paid_seat_on_platform" BOOLEAN,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "dealership_id" TEXT,
    "shipyard_id" TEXT,
    "dealership_office_id" TEXT,
    "is_email_verified" BOOLEAN,
    "role" TEXT,
    "phone" TEXT,
    "mailing_street" TEXT,
    "mailing_city" TEXT,
    "mailing_state" TEXT,
    "mailing_country" TEXT,
    "mailing_postal_code" TEXT,
    "signup_source" TEXT,
    "vessel_price_min" DECIMAL(14,2),
    "vessel_price_max" DECIMAL(14,2),
    "vessel_length_ft_min" DECIMAL(65,30),
    "vessel_length_ft_max" DECIMAL(65,30),
    "vessel_types" TEXT[],
    "vessel_location_preference" TEXT,
    "purchase_timeframe" TEXT,
    "has_buyer_broker" BOOLEAN,
    "listing_views_to_date" DECIMAL(65,30),
    "number_of_inquiries" DECIMAL(65,30),
    "vessel_saves_price_alerts" DECIMAL(65,30),
    "number_of_tours_scheduled" DECIMAL(65,30),
    "waylo_questions_7d" DECIMAL(65,30),
    "nautix_trips_30d" DECIMAL(65,30),
    "buyer_intent_score" DECIMAL(65,30),
    "top_events_30d" TEXT,
    "intent_tier" TEXT,
    "easyfund" BOOLEAN,
    "mastercover" BOOLEAN,
    "spotlight_video_views_30d" DECIMAL(65,30),
    "dob_year" TEXT,
    "prior_owned_vessels" TEXT,
    "tour_3d_views_30d" DECIMAL(65,30),
    "monthly_payment_min" DECIMAL(65,30),
    "waylo_max_q_per_session_7d" DECIMAL(65,30),
    "last_yachtway_login" DATE,
    "monthly_payment_max" DECIMAL(65,30),
    "inquiries_last_30d" DECIMAL(65,30),
    "buyer_broker_name" TEXT,
    "yrs_boat_ownership" DECIMAL(65,30),
    "sf_contact_id" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "company_id" TEXT,
    "company" TEXT,
    "listing_broker_id" TEXT,
    "listing_broker" TEXT,
    "yachtway_listing_id" TEXT,
    "vessel_listing_name" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" DECIMAL(65,30),
    "category" TEXT,
    "length_ft" DECIMAL(65,30),
    "beam" DECIMAL(65,30),
    "cabins" DECIMAL(65,30),
    "guests" DECIMAL(65,30),
    "fuel_type" TEXT,
    "number_of_engines" DECIMAL(65,30),
    "cruise_speed" DECIMAL(65,30),
    "top_speed" DECIMAL(65,30),
    "vessel_price" DECIMAL(14,2),
    "sales_status" TEXT,
    "active_from_date" DATE,
    "vessel_location_city" TEXT,
    "vessel_location_state" TEXT,
    "vessel_location_country" TEXT,
    "photo_count" DECIMAL(65,30),
    "video_count" DECIMAL(65,30),
    "has_3d_tour" BOOLEAN,
    "listing_link" TEXT,
    "views_total" DECIMAL(65,30),
    "views_30d" DECIMAL(65,30),
    "inquiries_30d" DECIMAL(65,30),
    "inquiries_total" DECIMAL(65,30),
    "phone_clicks" DECIMAL(65,30),
    "spotlight_to_listing_ctr" DECIMAL(65,30),
    "created_date" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_by" TEXT,
    "black_water_tank_gal" DECIMAL(65,30),
    "country_of_origin" TEXT,
    "cover_image_url" TEXT,
    "crew" DECIMAL(65,30),
    "double_beds" DECIMAL(65,30),
    "draft_ft" DECIMAL(65,30),
    "drive_type" TEXT,
    "dry_heads" DECIMAL(65,30),
    "dry_weight" DECIMAL(65,30),
    "engine_1_hrs" DECIMAL(65,30),
    "engine_2_hrs" DECIMAL(65,30),
    "engine_3_hrs" DECIMAL(65,30),
    "engine_4_hrs" DECIMAL(65,30),
    "engine_5_hrs" DECIMAL(65,30),
    "engine_6_hrs" DECIMAL(65,30),
    "engines_name" TEXT,
    "freshwater_tank_gal" DECIMAL(65,30),
    "fuel_tank_gal" DECIMAL(65,30),
    "fuel_tank_material" TEXT,
    "generator_1_hrs" DECIMAL(65,30),
    "generator_1_make" TEXT,
    "generator_2_hrs" DECIMAL(65,30),
    "generator_2_make" TEXT,
    "horsepower_per_engine" DECIMAL(65,30),
    "hull_material" TEXT,
    "listing_description" TEXT,
    "number_of_fuel_tanks" DECIMAL(65,30),
    "overall_length_ft" DECIMAL(65,30),
    "price_changes" TEXT,
    "range" DECIMAL(65,30),
    "sold_price" DECIMAL(14,2),
    "days_listed" DECIMAL(65,30),
    "single_beds" DECIMAL(65,30),
    "last_status_change" DATE,
    "tour_url" TEXT,
    "vessel_designer" TEXT,
    "waterline_length_ft" DECIMAL(65,30),
    "wet_heads" DECIMAL(65,30),
    "number_of_tours_scheduled" DECIMAL(65,30),
    "number_of_live_streams" DECIMAL(65,30),
    "number_of_price_alerts" DECIMAL(65,30),
    "social_reach" DECIMAL(65,30),
    "views_youtube" DECIMAL(65,30),
    "views_fb_main" DECIMAL(65,30),
    "views_ig_main" DECIMAL(65,30),
    "views_fb_hub" DECIMAL(65,30),
    "views_ig_hub" DECIMAL(65,30),
    "views_tiktok" DECIMAL(65,30),
    "vessel_details" BOOLEAN,
    "listing_extras" BOOLEAN,
    "vessel_features" BOOLEAN,
    "vessel_price_text" TEXT,
    "sold_price_text" TEXT,
    "hull_number" TEXT,
    "currency" TEXT,
    "is_price_visible" BOOLEAN,
    "is_exclusive" BOOLEAN,
    "is_available_for_co_brokerage" BOOLEAN,
    "has_spotlight" BOOLEAN,
    "heat_score" TEXT,
    "heat_tier" TEXT,
    "ai_description" TEXT,
    "tax_status" TEXT,
    "import_duty_paid_status" TEXT,
    "seller_highlights" TEXT,
    "general_warranty_expiration" TEXT,
    "powder_room" TEXT,
    "crew_cabins" TEXT,
    "crew_beds" TEXT,
    "crew_heads" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_events" (
    "id" TEXT NOT NULL,
    "dealer_id" TEXT,
    "dealer" TEXT,
    "event_name" TEXT,
    "dealer_name" TEXT,
    "boat_show_name" TEXT,
    "event_details" TEXT,
    "event_duration" TEXT,
    "event_end_time" TEXT,
    "event_end_date" DATE,
    "event_location" TEXT,
    "event_location_city" TEXT,
    "event_location_country" TEXT,
    "event_location_postal_code" TEXT,
    "event_location_state" TEXT,
    "event_location_street" TEXT,
    "event_start_date" DATE,
    "event_start_time" TEXT,
    "event_time_zone" TEXT,
    "event_type" TEXT,
    "public_or_private" TEXT,
    "yachtway_event_id" TEXT,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "is_active" BOOLEAN,
    "is_cancelled" BOOLEAN,
    "repeating" BOOLEAN,
    "invited_guests_emails" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_friendly_links" (
    "id" TEXT NOT NULL,
    "broker_id" TEXT,
    "broker_name" TEXT,
    "listing_id" TEXT,
    "listing" TEXT,
    "buyer_id" TEXT,
    "buyer" TEXT,
    "sellers_role" TEXT,
    "sellers_email" TEXT,
    "date_created" DATE,
    "channel_shared" BOOLEAN,
    "recipient_emails" TEXT,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "open_channel" BOOLEAN,
    "opened_at" TIMESTAMP(3),
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_friendly_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "product_code" TEXT,
    "product_family" TEXT,
    "description" TEXT,
    "list_price" DECIMAL(14,2),
    "unit" TEXT,
    "revenue_type" TEXT,
    "active" BOOLEAN,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_line_items" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "opportunity_name" TEXT,
    "product_id" TEXT,
    "product_name" TEXT,
    "quantity" DECIMAL(65,30),
    "list_price" DECIMAL(14,2),
    "unit_price" DECIMAL(14,2),
    "discount" DECIMAL(6,3),
    "total_price" DECIMAL(14,2),
    "service_date" DATE,
    "description" TEXT,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunity_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "record_type" TEXT,
    "contact_id" TEXT,
    "contact" TEXT,
    "related_listing_id" TEXT,
    "related_listing" TEXT,
    "owner_id" TEXT,
    "owner" TEXT,
    "created_date" TIMESTAMP(3),
    "opportunity_status" TEXT,
    "last_stage_change_date" TIMESTAMP(3),
    "opportunity_amount" DECIMAL(14,2),
    "opportunity_closed" DATE,
    "name" TEXT,
    "stage" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_medium" TEXT,
    "utm_source" TEXT,
    "vessel_make" TEXT,
    "vessel_model" TEXT,
    "vessel_year" TEXT,
    "created_by_id" TEXT,
    "created_by" TEXT,
    "lost_reason" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "easyfund_loans" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "dealer_id" TEXT,
    "dealer" TEXT,
    "coapplicant_id" TEXT,
    "coapplicant" TEXT,
    "lender_id" TEXT,
    "lender" TEXT,
    "added_to_dealer_closed_referrals" BOOLEAN,
    "added_to_dealer_total_referrals" BOOLEAN,
    "amount_from_lender" DECIMAL(14,2),
    "approved_conditions" TEXT[],
    "approved_conditions_notes" TEXT,
    "close_date" DATE,
    "co_applicant_credit_score" TEXT,
    "co_applicant_monthly_debt" DECIMAL(14,2),
    "co_applicant_monthly_income" DECIMAL(14,2),
    "co_applicant_monthly_income_range" TEXT,
    "credit_score" TEXT,
    "currently_financed_through" TEXT,
    "dealer_referral_bonus" DECIMAL(14,2),
    "decline_notes" TEXT,
    "decline_reason" TEXT,
    "down_payment" DECIMAL(14,2),
    "engine_make" TEXT,
    "engine_type" TEXT,
    "has_co_applicant" BOOLEAN,
    "horsepower" DECIMAL(65,30),
    "interest_rate" DECIMAL(6,3),
    "lead_source" TEXT,
    "loan_amount" DECIMAL(14,2),
    "loan_term" DECIMAL(65,30),
    "loan_type" TEXT,
    "monthly_debt" DECIMAL(14,2),
    "monthly_income" DECIMAL(14,2),
    "monthly_income_range" TEXT,
    "monthly_payment" DECIMAL(14,2),
    "number_of_engines" DECIMAL(65,30),
    "opportunity_created" DATE,
    "paid_to_referring_dealer" DECIMAL(14,2),
    "prequalification_id" TEXT,
    "purchase_price" DECIMAL(14,2),
    "purchase_refinance" TEXT,
    "referral_to_dealer" DECIMAL(65,30),
    "referral_fee_added_to_dealer_account" BOOLEAN,
    "reserve" DECIMAL(65,30),
    "vessel_listing_url" TEXT,
    "easyfund_external_id" TEXT,
    "status" TEXT,
    "is_credit_score_too_low" BOOLEAN,
    "notify_dealer" BOOLEAN,
    "credit_check_date" DATE,
    "current_step" TEXT,
    "with_co_borrower" BOOLEAN,
    "borrower_documents_submitted_at" TIMESTAMP(3),
    "permission_granted" BOOLEAN,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "easyfund_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mastercover_applications" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "insurer_id" TEXT,
    "insurance_company" TEXT,
    "actual_premium" DECIMAL(14,2),
    "added_to_dealer_closed_referrals" BOOLEAN,
    "added_to_dealer_total_referrals" BOOLEAN,
    "anyone_live_aboard" BOOLEAN,
    "build_type" TEXT,
    "captain" BOOLEAN,
    "center_console" BOOLEAN,
    "close_date" DATE,
    "coverages" TEXT[],
    "cruising_area" TEXT,
    "engine_type" TEXT,
    "vessel_flag_location" TEXT,
    "horsepower" DECIMAL(65,30),
    "hull_material" TEXT,
    "hull_type" TEXT,
    "lead_source" TEXT,
    "loan" BOOLEAN,
    "loan_amount" DECIMAL(14,2),
    "mastercover_id" TEXT,
    "notes" TEXT,
    "number_crew_onboard" DECIMAL(65,30),
    "opportunity_created" DATE,
    "credited_to_referring_dealer" DECIMAL(14,2),
    "policy_effective_date" DATE,
    "policy_status" TEXT,
    "estimated_premium" DECIMAL(14,2),
    "referral_to_dealer" DECIMAL(65,30),
    "referral_fee_added_to_dealer_account" BOOLEAN,
    "tender_hp_per_engine" DECIMAL(65,30),
    "tender_make" TEXT,
    "tender_model" TEXT,
    "tender_num_of_engines" DECIMAL(65,30),
    "tender_year" DECIMAL(65,30),
    "tender" BOOLEAN,
    "trailer_make" TEXT,
    "trailer_model" TEXT,
    "trailer_year" DECIMAL(65,30),
    "trailer" BOOLEAN,
    "used_for_charter" BOOLEAN,
    "vessel_length_ft" DECIMAL(65,30),
    "vessel_name" TEXT,
    "vessel_participate_in_races" BOOLEAN,
    "vessel_top_speed_knots" DECIMAL(65,30),
    "vessel_type" TEXT,
    "vessel_value" DECIMAL(14,2),
    "year_of_engine" DECIMAL(65,30),
    "submitted_at" TIMESTAMP(3),
    "due_date" DATE,
    "team_id" TEXT,
    "last_customer_action_at" TIMESTAMP(3),
    "last_agent_action_at" TIMESTAMP(3),
    "archive_reason" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mastercover_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_details" (
    "id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "account_id" TEXT,
    "account" TEXT,
    "bill_to_account_id" TEXT,
    "bill_to_account" TEXT,
    "access_information" TEXT,
    "amount_paid" DECIMAL(14,2),
    "at_boat_show" BOOLEAN,
    "boat_show" TEXT,
    "request_received_email_sent" BOOLEAN,
    "dop" TEXT,
    "dop_2" TEXT,
    "gate_slip" TEXT,
    "ins_required_by_location" BOOLEAN,
    "link_to_vessel_external" TEXT,
    "location_type" TEXT,
    "mooring_address" TEXT,
    "notes" TEXT,
    "onsite_contact_name" TEXT,
    "onsite_contact_phone" TEXT,
    "requested_date" DATE,
    "requested_services" TEXT,
    "requested_time" TEXT,
    "rescheduling_policy_acknowledgement" BOOLEAN,
    "scheduled_confirmation_email_sent" BOOLEAN,
    "scheduled_date" DATE,
    "scheduled_time" TEXT,
    "special_requests" TEXT,
    "studio_pass_member" BOOLEAN,
    "vessel_listing_url" TEXT,
    "vessel_name" TEXT,
    "vessel_ready_acknowledgement" BOOLEAN,
    "water_toys" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT,
    "company_id" TEXT,
    "related_listing_id" TEXT,
    "channel" TEXT,
    "direction" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT,
    "activity_timestamp" TIMESTAMP(3),
    "owner_id" TEXT,
    "attachment_count" DECIMAL(65,30),
    "created_by_id" TEXT,
    "from_address" TEXT,
    "to_addresses" TEXT[],
    "cc_addresses" TEXT[],
    "email_subject" TEXT,
    "thread_id" TEXT,
    "open_count" DECIMAL(65,30),
    "click_count" DECIMAL(65,30),
    "link_clicked" TEXT,
    "from_number" TEXT,
    "to_number" TEXT,
    "message_type" TEXT,
    "delivery_status" TEXT,
    "call_direction" TEXT,
    "call_duration_sec" DECIMAL(65,30),
    "call_outcome" TEXT,
    "recording_url" TEXT,
    "voicemail_transcript" TEXT,
    "dialog_id" TEXT,
    "dialog_contact_type" TEXT,
    "is_support_chat" BOOLEAN,
    "is_contact_chat" BOOLEAN,
    "is_ai_chat" BOOLEAN,
    "sender_marked_for_later_at" TIMESTAMP(3),
    "contact_form_id" TEXT,
    "wa_message_type" TEXT,
    "template_name" TEXT,
    "wa_conversation_id" TEXT,
    "media_url" TEXT,
    "sensitivity_class" TEXT,
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "channel" TEXT NOT NULL,
    "external_id" TEXT,
    "business_account_id" TEXT,
    "display_name" TEXT,
    "handle" TEXT,
    "profile_url" TEXT,
    "is_active" BOOLEAN,
    "connected_at" TIMESTAMP(3),
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[],
    "custom_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "granularity" TEXT,
    "impressions" DECIMAL(65,30),
    "reach" DECIMAL(65,30),
    "engagements" DECIMAL(65,30),
    "engagement_rate" DECIMAL(6,3),
    "followers" DECIMAL(65,30),
    "followers_delta" DECIMAL(65,30),
    "profile_views" DECIMAL(65,30),
    "video_views" DECIMAL(65,30),
    "watch_time_minutes" DECIMAL(65,30),
    "likes" DECIMAL(65,30),
    "comments" DECIMAL(65,30),
    "shares" DECIMAL(65,30),
    "saves" DECIMAL(65,30),
    "subscribers_gained" DECIMAL(65,30),
    "subscribers_lost" DECIMAL(65,30),
    "sessions" DECIMAL(65,30),
    "users" DECIMAL(65,30),
    "new_users" DECIMAL(65,30),
    "bounce_rate" DECIMAL(6,3),
    "avg_session_duration_sec" DECIMAL(65,30),
    "clicks" DECIMAL(65,30),
    "link_clicks" DECIMAL(65,30),
    "ctr" DECIMAL(6,3),
    "spend" DECIMAL(14,2),
    "cpc" DECIMAL(14,2),
    "cpm" DECIMAL(14,2),
    "conversions" DECIMAL(65,30),
    "leads" DECIMAL(65,30),
    "metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_grants" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "resource_class" TEXT NOT NULL,
    "can_read" BOOLEAN NOT NULL DEFAULT false,
    "can_write" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "resource_class" TEXT,
    "table_name" TEXT,
    "record_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompanyAuthorizedBrands" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompanyAuthorizedBrands_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContactBrandInterests" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactBrandInterests_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE INDEX "users_created_by_id_idx" ON "users"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_yachtway_db_account_id_key" ON "companies"("yachtway_db_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_sf_account_id_key" ON "companies"("sf_account_id");

-- CreateIndex
CREATE INDEX "companies_owner_id_idx" ON "companies"("owner_id");

-- CreateIndex
CREATE INDEX "companies_parent_company_id_idx" ON "companies"("parent_company_id");

-- CreateIndex
CREATE INDEX "companies_primary_contact_id_idx" ON "companies"("primary_contact_id");

-- CreateIndex
CREATE INDEX "companies_easysign_primary_contact_id_idx" ON "companies"("easysign_primary_contact_id");

-- CreateIndex
CREATE INDEX "companies_created_by_id_idx" ON "companies"("created_by_id");

-- CreateIndex
CREATE INDEX "companies_company_status_idx" ON "companies"("company_status");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_yachtway_db_id_key" ON "contacts"("yachtway_db_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_sf_contact_id_key" ON "contacts"("sf_contact_id");

-- CreateIndex
CREATE INDEX "contacts_company_id_idx" ON "contacts"("company_id");

-- CreateIndex
CREATE INDEX "contacts_owner_id_idx" ON "contacts"("owner_id");

-- CreateIndex
CREATE INDEX "contacts_created_by_id_idx" ON "contacts"("created_by_id");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "listings_yachtway_listing_id_key" ON "listings"("yachtway_listing_id");

-- CreateIndex
CREATE INDEX "listings_company_id_idx" ON "listings"("company_id");

-- CreateIndex
CREATE INDEX "listings_listing_broker_id_idx" ON "listings"("listing_broker_id");

-- CreateIndex
CREATE INDEX "listings_created_by_id_idx" ON "listings"("created_by_id");

-- CreateIndex
CREATE INDEX "dealer_events_dealer_id_idx" ON "dealer_events"("dealer_id");

-- CreateIndex
CREATE INDEX "dealer_events_created_by_id_idx" ON "dealer_events"("created_by_id");

-- CreateIndex
CREATE INDEX "broker_friendly_links_broker_id_idx" ON "broker_friendly_links"("broker_id");

-- CreateIndex
CREATE INDEX "broker_friendly_links_buyer_id_idx" ON "broker_friendly_links"("buyer_id");

-- CreateIndex
CREATE INDEX "broker_friendly_links_listing_id_idx" ON "broker_friendly_links"("listing_id");

-- CreateIndex
CREATE INDEX "broker_friendly_links_created_by_id_idx" ON "broker_friendly_links"("created_by_id");

-- CreateIndex
CREATE INDEX "products_created_by_id_idx" ON "products"("created_by_id");

-- CreateIndex
CREATE INDEX "opportunity_line_items_opportunity_id_idx" ON "opportunity_line_items"("opportunity_id");

-- CreateIndex
CREATE INDEX "opportunity_line_items_product_id_idx" ON "opportunity_line_items"("product_id");

-- CreateIndex
CREATE INDEX "opportunity_line_items_created_by_id_idx" ON "opportunity_line_items"("created_by_id");

-- CreateIndex
CREATE INDEX "opportunities_contact_id_idx" ON "opportunities"("contact_id");

-- CreateIndex
CREATE INDEX "opportunities_related_listing_id_idx" ON "opportunities"("related_listing_id");

-- CreateIndex
CREATE INDEX "opportunities_owner_id_idx" ON "opportunities"("owner_id");

-- CreateIndex
CREATE INDEX "opportunities_created_by_id_idx" ON "opportunities"("created_by_id");

-- CreateIndex
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "easyfund_loans_opportunity_id_key" ON "easyfund_loans"("opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "easyfund_loans_prequalification_id_key" ON "easyfund_loans"("prequalification_id");

-- CreateIndex
CREATE UNIQUE INDEX "easyfund_loans_easyfund_external_id_key" ON "easyfund_loans"("easyfund_external_id");

-- CreateIndex
CREATE INDEX "easyfund_loans_opportunity_id_idx" ON "easyfund_loans"("opportunity_id");

-- CreateIndex
CREATE INDEX "easyfund_loans_dealer_id_idx" ON "easyfund_loans"("dealer_id");

-- CreateIndex
CREATE INDEX "easyfund_loans_coapplicant_id_idx" ON "easyfund_loans"("coapplicant_id");

-- CreateIndex
CREATE INDEX "easyfund_loans_lender_id_idx" ON "easyfund_loans"("lender_id");

-- CreateIndex
CREATE UNIQUE INDEX "mastercover_applications_opportunity_id_key" ON "mastercover_applications"("opportunity_id");

-- CreateIndex
CREATE UNIQUE INDEX "mastercover_applications_mastercover_id_key" ON "mastercover_applications"("mastercover_id");

-- CreateIndex
CREATE INDEX "mastercover_applications_opportunity_id_idx" ON "mastercover_applications"("opportunity_id");

-- CreateIndex
CREATE INDEX "mastercover_applications_insurer_id_idx" ON "mastercover_applications"("insurer_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_details_opportunity_id_key" ON "studio_details"("opportunity_id");

-- CreateIndex
CREATE INDEX "studio_details_opportunity_id_idx" ON "studio_details"("opportunity_id");

-- CreateIndex
CREATE INDEX "studio_details_account_id_idx" ON "studio_details"("account_id");

-- CreateIndex
CREATE INDEX "studio_details_bill_to_account_id_idx" ON "studio_details"("bill_to_account_id");

-- CreateIndex
CREATE INDEX "conversations_contact_id_idx" ON "conversations"("contact_id");

-- CreateIndex
CREATE INDEX "conversations_company_id_idx" ON "conversations"("company_id");

-- CreateIndex
CREATE INDEX "conversations_related_listing_id_idx" ON "conversations"("related_listing_id");

-- CreateIndex
CREATE INDEX "conversations_owner_id_idx" ON "conversations"("owner_id");

-- CreateIndex
CREATE INDEX "conversations_created_by_id_idx" ON "conversations"("created_by_id");

-- CreateIndex
CREATE INDEX "conversations_activity_timestamp_idx" ON "conversations"("activity_timestamp");

-- CreateIndex
CREATE INDEX "conversations_channel_idx" ON "conversations"("channel");

-- CreateIndex
CREATE INDEX "analytics_profiles_company_id_idx" ON "analytics_profiles"("company_id");

-- CreateIndex
CREATE INDEX "analytics_profiles_channel_idx" ON "analytics_profiles"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_profiles_channel_external_id_key" ON "analytics_profiles"("channel", "external_id");

-- CreateIndex
CREATE INDEX "analytics_snapshots_profile_id_idx" ON "analytics_snapshots"("profile_id");

-- CreateIndex
CREATE INDEX "analytics_snapshots_period_start_idx" ON "analytics_snapshots"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "permission_grants_role_id_idx" ON "permission_grants"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_grants_role_id_resource_class_key" ON "permission_grants"("role_id", "resource_class");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_idx" ON "audit_logs"("table_name", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "_CompanyAuthorizedBrands_B_index" ON "_CompanyAuthorizedBrands"("B");

-- CreateIndex
CREATE INDEX "_ContactBrandInterests_B_index" ON "_ContactBrandInterests"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_user_role_fkey" FOREIGN KEY ("user_role") REFERENCES "roles"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_fkey" FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_easysign_primary_contact_id_fkey" FOREIGN KEY ("easysign_primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_listing_broker_id_fkey" FOREIGN KEY ("listing_broker_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_events" ADD CONSTRAINT "dealer_events_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_friendly_links" ADD CONSTRAINT "broker_friendly_links_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_friendly_links" ADD CONSTRAINT "broker_friendly_links_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_friendly_links" ADD CONSTRAINT "broker_friendly_links_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_line_items" ADD CONSTRAINT "opportunity_line_items_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_line_items" ADD CONSTRAINT "opportunity_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_related_listing_id_fkey" FOREIGN KEY ("related_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easyfund_loans" ADD CONSTRAINT "easyfund_loans_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easyfund_loans" ADD CONSTRAINT "easyfund_loans_dealer_id_fkey" FOREIGN KEY ("dealer_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easyfund_loans" ADD CONSTRAINT "easyfund_loans_coapplicant_id_fkey" FOREIGN KEY ("coapplicant_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easyfund_loans" ADD CONSTRAINT "easyfund_loans_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastercover_applications" ADD CONSTRAINT "mastercover_applications_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mastercover_applications" ADD CONSTRAINT "mastercover_applications_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_details" ADD CONSTRAINT "studio_details_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_details" ADD CONSTRAINT "studio_details_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_details" ADD CONSTRAINT "studio_details_bill_to_account_id_fkey" FOREIGN KEY ("bill_to_account_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_related_listing_id_fkey" FOREIGN KEY ("related_listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_profiles" ADD CONSTRAINT "analytics_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "analytics_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyAuthorizedBrands" ADD CONSTRAINT "_CompanyAuthorizedBrands_A_fkey" FOREIGN KEY ("A") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyAuthorizedBrands" ADD CONSTRAINT "_CompanyAuthorizedBrands_B_fkey" FOREIGN KEY ("B") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactBrandInterests" ADD CONSTRAINT "_ContactBrandInterests_A_fkey" FOREIGN KEY ("A") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactBrandInterests" ADD CONSTRAINT "_ContactBrandInterests_B_fkey" FOREIGN KEY ("B") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
