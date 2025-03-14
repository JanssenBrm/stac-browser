import ErrorAlert from '../components/ErrorAlert.vue';
import Loading from '../components/Loading.vue';
import Utils, { BrowserError } from '../utils';
import URI from 'urijs';
import { mapState, mapGetters } from 'vuex';

export default {
  components: {
    ErrorAlert,
    Loading
  },
  props: {
    path: {
      type: String,
      required: true
    }
  },
  computed: {
    ...mapState(["allowExternalAccess", "catalogUrl", "url", "redirectLegacyUrls"]),
    ...mapGetters(["fromBrowserPath", "error", "loading"]),
    errorId() {
      if (this.error instanceof Error && this.error.isAxiosError && Utils.isObject(this.error.response)) {
        let res = this.error.response;
        if (Utils.isObject(res.data) && res.data.code) {
          return res.data.code;
        }
        else {
          return res.status;
        }
      }
      return null;
    },
    errorDescription() {      
      if (this.error instanceof Error && this.error.isAxiosError && Utils.isObject(this.error.response)) {
        let res = this.error.response;
        if (Utils.isObject(res.data) && typeof res.data.description === 'string') { // STAC API compliant error response
          return res.data.description;
        }
        if (res.status === 401) {
          return this.$t('errors.unauthorized');
        }
        else if (res.status === 403) {
          return this.$t('errors.forbidden');
        }
        else if (res.status === 404) {
          return this.$t('errors.notFound');
        }
        else if (res.status > 500) {
          return this.$t('errors.serverError');
        }
        else if (res.status > 400) {
          return this.$t('errors.badRequest');
        }
      }
      else if (this.error instanceof BrowserError) {
        return this.error.message;
      }

      return this.$t('errors.networkError');
    },
    isExternal() {
      return URI(this.path).is("absolute");
    }
  },
  watch: {
    path: {
      immediate: true,
      async handler(path, oldPath) {
        if (path === oldPath) {
          return;
        }
        else if (!this.allowExternalAccess && this.isExternal) {
          return;
        }
        else if (this.redirectLegacyUrls && await this.redirectLegacyUrl(path)) {
          return;
        }

        let url = this.fromBrowserPath(path || '/');
        this.$store.dispatch("load", { url, show: true });
      }
    }
  },
  methods: {
    async redirectLegacyUrl(path) {
      if (!path || path === '/') {
        return false;
      }
      // Split all subpaths and remove the leading item or collection prefixes from the old STAC Browser routes
      let parts = path.split('/').filter(part => part.length > 0 && part !== 'item' && part !== 'collection');
      // Make sure all remaining parts are valid base58, otherwise they likely no legacy URLs
      if (parts.length > 0 && parts.every(part => part.match(/^[123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ]+$/))) {
        // Lazy load base58 so that it's only in the loaded when really needed
        const { decode } = await import('bs58');
        // Decode last path element from base58, the others parts are not relevant for us
        let newPath = decode(parts[parts.length - 1]).toString();
        if (newPath) {
          let uri = URI(newPath);
          // Navigate to new URL
          this.$router.replace({
            // Remove trailing collections or items paths from APIs
            path: '/' + uri.path().replace(/(collections|items)\/?$/, ''),
            query: uri.query(true)
          });
          return true;
        }
      }
      return false;
    }
  }
};
