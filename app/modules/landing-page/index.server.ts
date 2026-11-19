import { db } from "~/db";
import { getLandingPage, type Db } from "./lib/landing-page";

export type {
  LandingAction,
  LandingCourse,
  LandingPage,
} from "./lib/landing-page";

/**
 * The landing page at `/`, bound to a database. The app uses `landingPage`;
 * tests build their own against a test database.
 */
export function createLandingPage(database: Db) {
  return {
    /**
     * Everything the landing page shows: the newest published course as the
     * hero's spotlight, up to three more for the featured grid, the catalogue
     * counts, and the hero's second button, which depends on whether the
     * visitor is signed in.
     */
    get({ signedIn }: { signedIn: boolean }) {
      return getLandingPage(database, signedIn);
    },
  };
}

export const landingPage = /* @__PURE__ */ createLandingPage(db);
