CREATE TABLE "apple_subscriptions" (
	"app_account_token" text,
	"app_transaction_id" text,
	"auto_renew_enabled" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"environment" text NOT NULL,
	"expires_at" timestamp with time zone,
	"grace_period_expires_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"is_in_billing_retry_period" boolean DEFAULT false NOT NULL,
	"last_notification_subtype" text,
	"last_notification_type" text,
	"last_purchased_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_transaction_id" text,
	"original_purchased_at" timestamp with time zone,
	"original_transaction_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"product_id" text NOT NULL,
	"revocation_reason" text,
	"revoked_at" timestamp with time zone,
	"status" text NOT NULL,
	"subscription_group_identifier" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_transactions" (
	"app_account_token" text,
	"app_transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text,
	"environment" text NOT NULL,
	"expires_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"in_app_ownership_type" text,
	"is_upgraded" boolean DEFAULT false NOT NULL,
	"original_purchase_date" timestamp with time zone,
	"original_transaction_id" text NOT NULL,
	"price_in_milliunits" integer,
	"product_id" text NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"revocation_reason" text,
	"revocation_type" text,
	"revoked_at" timestamp with time zone,
	"transaction_id" text NOT NULL,
	"transaction_reason" text,
	"type" text NOT NULL,
	"user_id" text NOT NULL,
	"web_order_line_item_id" text
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"app_account_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"environment" text,
	"external_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"notification_subtype" text,
	"notification_type" text,
	"original_transaction_id" text,
	"processed_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"signed_date" timestamp with time zone,
	"source" text NOT NULL,
	"transaction_id" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "user_entitlements" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"feature_key" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan_key" text,
	"product_id" text,
	"source" text NOT NULL,
	"source_environment" text,
	"source_original_transaction_id" text,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apple_subscriptions" ADD CONSTRAINT "apple_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_transactions" ADD CONSTRAINT "apple_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apple_subscriptions_latest_transaction_id_unique" ON "apple_subscriptions" USING btree ("latest_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_subscriptions_original_transaction_id_unique" ON "apple_subscriptions" USING btree ("original_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_transactions_transaction_id_unique" ON "apple_transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_app_account_token_unique" ON "billing_customers" USING btree ("app_account_token");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_id_unique" ON "billing_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_source_external_id_unique" ON "billing_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_entitlements_user_feature_unique" ON "user_entitlements" USING btree ("user_id","feature_key");