"""Pure configuration tests, also runnable directly with unittest."""

import unittest

from app.config import Settings


class RenderSettingsTests(unittest.TestCase):
    def test_render_database_schemes_use_psycopg3(self):
        suffix = "user:p%40ss@internal-host/journey?sslmode=require&application_name=api"
        for scheme in ("postgresql://", "postgres://"):
            with self.subTest(scheme=scheme):
                settings = Settings(_env_file=None, database_url=scheme + suffix)
                self.assertEqual(settings.database_url, "postgresql+psycopg://" + suffix)

    def test_explicit_driver_is_not_rewritten(self):
        url = "postgresql+psycopg://user:password@host/journey"
        self.assertEqual(Settings(_env_file=None, database_url=url).database_url, url)

    def test_scheme_inside_credentials_is_not_rewritten(self):
        url = "postgresql+psycopg://user:postgresql%3A%2F%2F@host/journey"
        self.assertEqual(Settings(_env_file=None, database_url=url).database_url, url)

    def test_production_still_requires_object_storage(self):
        with self.assertRaisesRegex(ValueError, "private object storage"):
            Settings(
                _env_file=None, environment="production", storage_driver="local"
            ).validate_runtime()


if __name__ == "__main__":
    unittest.main()
