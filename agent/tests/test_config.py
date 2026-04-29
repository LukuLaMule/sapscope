"""Tests unitaires — agent/config.py (SAPConfig + load_systems_from_yaml)."""

import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

# Make sure the agent package is importable when tests run from the project root
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

# Set required env vars before importing the module so dataclass defaults don't
# raise KeyError when the test environment has no SAP_* variables.
os.environ.setdefault("SAP_USER", "TESTUSER")
os.environ.setdefault("SAP_PASSWD", "TESTPASSWD")

from agent.config import SAPConfig, load_systems_from_yaml  # noqa: E402


class TestSAPConfigTopyrfcAshost(unittest.TestCase):
    """to_pyrfc() in ashost mode."""

    def _make(self, **kwargs) -> SAPConfig:
        defaults = dict(ashost="10.0.0.1", sysnr="00", client="100",
                        user="RFCUSER", passwd="secret", lang="EN")
        defaults.update(kwargs)
        return SAPConfig(**defaults)

    def test_ashost_keys_present(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        for key in ("ashost", "sysnr", "client", "user", "passwd", "lang"):
            self.assertIn(key, result, f"missing key: {key}")

    def test_ashost_values(self):
        cfg = self._make(ashost="sap-app.example.com", sysnr="01", client="200")
        result = cfg.to_pyrfc()
        self.assertEqual(result["ashost"], "sap-app.example.com")
        self.assertEqual(result["sysnr"], "01")
        self.assertEqual(result["client"], "200")

    def test_ashost_no_mshost_keys(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        for key in ("mshost", "msserv", "r3name", "group"):
            self.assertNotIn(key, result, f"unexpected key in ashost mode: {key}")

    def test_ashost_no_saprouter_when_empty(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        self.assertNotIn("saprouter", result)


class TestSAPConfigToyrfcMshost(unittest.TestCase):
    """to_pyrfc() in mshost (message server) mode."""

    def _make(self, **kwargs) -> SAPConfig:
        defaults = dict(mshost="sapms.example.com", msserv="3601",
                        r3name="P01", group="PUBLIC", client="100",
                        user="RFCUSER", passwd="secret", lang="EN")
        defaults.update(kwargs)
        return SAPConfig(**defaults)

    def test_mshost_keys_present(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        for key in ("mshost", "msserv", "r3name", "group", "client", "user", "passwd", "lang"):
            self.assertIn(key, result, f"missing key: {key}")

    def test_mshost_values(self):
        cfg = self._make(mshost="sapms.corp.com", r3name="DEV", group="ABAP_CI")
        result = cfg.to_pyrfc()
        self.assertEqual(result["mshost"], "sapms.corp.com")
        self.assertEqual(result["r3name"], "DEV")
        self.assertEqual(result["group"], "ABAP_CI")

    def test_mshost_no_ashost_sysnr(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        self.assertNotIn("ashost", result)
        self.assertNotIn("sysnr", result)

    def test_mshost_no_saprouter_when_empty(self):
        cfg = self._make()
        result = cfg.to_pyrfc()
        self.assertNotIn("saprouter", result)


class TestSAPConfigSaprouter(unittest.TestCase):
    """to_pyrfc() with saprouter set."""

    def test_ashost_saprouter_present(self):
        cfg = SAPConfig(
            ashost="10.1.2.3", sysnr="00", client="000",
            user="RFCUSER", passwd="secret", lang="EN",
            saprouter="/H/router.example.com/H/",
        )
        result = cfg.to_pyrfc()
        self.assertIn("saprouter", result)
        self.assertEqual(result["saprouter"], "/H/router.example.com/H/")

    def test_mshost_saprouter_present(self):
        cfg = SAPConfig(
            mshost="sapms.example.com", msserv="3601", r3name="PRD",
            group="PUBLIC", client="000",
            user="RFCUSER", passwd="secret", lang="EN",
            saprouter="/H/router.example.com/H/",
        )
        result = cfg.to_pyrfc()
        self.assertIn("saprouter", result)
        self.assertIn("mshost", result)
        self.assertNotIn("ashost", result)


class TestLoadSystemsFromYaml(unittest.TestCase):
    """load_systems_from_yaml() with in-memory YAML written to a temp file."""

    def _write_yaml(self, content: str) -> Path:
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".yaml",
                                        delete=False, encoding="utf-8")
        f.write(textwrap.dedent(content))
        f.close()
        self._tmpfiles = getattr(self, "_tmpfiles", [])
        self._tmpfiles.append(f.name)
        return Path(f.name)

    def tearDown(self):
        for name in getattr(self, "_tmpfiles", []):
            try:
                os.unlink(name)
            except OSError:
                pass

    def test_ashost_mode(self):
        path = self._write_yaml("""
            systems:
              - mode: ashost
                ashost: sap-dev.example.com
                sysnr: "01"
                client: "100"
                user: DEVUSER
                passwd: devpass
        """)
        configs = load_systems_from_yaml(path)
        self.assertEqual(len(configs), 1)
        cfg = configs[0]
        self.assertEqual(cfg.ashost, "sap-dev.example.com")
        self.assertEqual(cfg.sysnr, "01")
        self.assertEqual(cfg.client, "100")
        self.assertEqual(cfg.user, "DEVUSER")

    def test_ashost_to_pyrfc_keys(self):
        path = self._write_yaml("""
            systems:
              - mode: ashost
                ashost: 192.168.1.10
                sysnr: "00"
                client: "000"
                user: BASIS
                passwd: basis123
        """)
        cfg = load_systems_from_yaml(path)[0]
        result = cfg.to_pyrfc()
        self.assertIn("ashost", result)
        self.assertIn("sysnr", result)
        self.assertNotIn("mshost", result)

    def test_mshost_mode(self):
        path = self._write_yaml("""
            systems:
              - mode: mshost
                mshost: sapms.corp.com
                msserv: "3601"
                r3name: PRD
                group: PUBLIC
                client: "100"
                user: PRDUSER
                passwd: prdpass
        """)
        configs = load_systems_from_yaml(path)
        self.assertEqual(len(configs), 1)
        cfg = configs[0]
        self.assertEqual(cfg.mshost, "sapms.corp.com")
        self.assertEqual(cfg.r3name, "PRD")

    def test_mshost_to_pyrfc_keys(self):
        path = self._write_yaml("""
            systems:
              - mode: mshost
                mshost: sapms.corp.com
                msserv: sapmsP01
                r3name: P01
                group: ABAP
                client: "200"
                user: RFCUSER
                passwd: rfcpass
        """)
        cfg = load_systems_from_yaml(path)[0]
        result = cfg.to_pyrfc()
        self.assertIn("mshost", result)
        self.assertIn("msserv", result)
        self.assertIn("r3name", result)
        self.assertNotIn("ashost", result)
        self.assertNotIn("sysnr", result)

    def test_multiple_systems(self):
        path = self._write_yaml("""
            systems:
              - mode: ashost
                ashost: dev-sap
                sysnr: "00"
                client: "100"
                user: DEVUSER
                passwd: devpass
              - mode: mshost
                mshost: sapms.prod.com
                msserv: "3601"
                r3name: PRD
                group: PUBLIC
                client: "200"
                user: PRDUSER
                passwd: prdpass
        """)
        configs = load_systems_from_yaml(path)
        self.assertEqual(len(configs), 2)
        self.assertEqual(configs[0].ashost, "dev-sap")
        self.assertEqual(configs[1].mshost, "sapms.prod.com")

    def test_empty_systems_list(self):
        path = self._write_yaml("systems: []\n")
        configs = load_systems_from_yaml(path)
        self.assertEqual(configs, [])

    def test_saprouter_in_yaml(self):
        path = self._write_yaml("""
            systems:
              - mode: ashost
                ashost: 10.0.0.5
                sysnr: "00"
                client: "000"
                saprouter: /H/router.example.com/H/
                user: RFCUSER
                passwd: rfcpass
        """)
        cfg = load_systems_from_yaml(path)[0]
        result = cfg.to_pyrfc()
        self.assertIn("saprouter", result)
        self.assertEqual(result["saprouter"], "/H/router.example.com/H/")


if __name__ == "__main__":
    unittest.main()
