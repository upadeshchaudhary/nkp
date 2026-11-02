CREATE TYPE "ContentRightsType" AS ENUM ('ORIGINAL', 'THIRD_PARTY');

ALTER TABLE "content"
ADD COLUMN "rights_type" "ContentRightsType";
