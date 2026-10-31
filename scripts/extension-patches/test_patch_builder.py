"""Guard against silently patching a changed vendor build."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('patch_extension', Path(__file__).parents[1] / 'patch_aitoearn_extension.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)


class VendorIntegrityTests(unittest.TestCase):
    def test_content_result_bridge_requires_exact_vendor_anchor(self):
        for source in ['', patch.CONTENT_RECOVERY_ANCHOR * 2]:
            with self.assertRaisesRegex(ValueError, 'content recovery anchor'):
                patch.patch_content(source)
        self.assertEqual(patch.patch_content(patch.CONTENT_RECOVERY_ANCHOR), patch.CONTENT_RECOVERY_REPLACEMENT)

    def test_missing_payload_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact video payload anchor'):
            patch.patch_background('unrelated publisher')

    def test_multiple_payload_anchors_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact video payload anchor'):
            patch.patch_background(patch.ANCHOR * 2)

    def test_already_patched_bundle_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'already patched'):
            patch.patch_background('__aitoearnLocalWxFields' + patch.ANCHOR)

    def test_missing_activity_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact activity payload anchor'):
            patch.patch_background(patch.ANCHOR)

    def test_multiple_activity_anchors_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact activity payload anchor'):
            patch.patch_background(patch.ANCHOR + patch.EVENT_ANCHOR * 2)

    def test_both_payload_changes_are_applied(self):
        source = patch.ANCHOR + patch.EVENT_ANCHOR + patch.EXT_READING_ANCHOR + patch.COMPONENT_ANCHOR + ''.join(item[0] for item in patch.AUDIT_PATCHES)
        result = patch.patch_background(source)
        self.assertIn(patch.REPLACEMENT, result)
        self.assertIn(patch.EVENT_REPLACEMENT, result)
        self.assertIn(patch.EXT_READING_REPLACEMENT, result)
        self.assertIn(patch.COMPONENT_REPLACEMENT, result)
        for _, replacement, _ in patch.AUDIT_PATCHES:
            self.assertIn(replacement, result)

    def test_missing_or_duplicate_audit_anchors_are_rejected(self):
        source = patch.ANCHOR + patch.EVENT_ANCHOR + patch.EXT_READING_ANCHOR + patch.COMPONENT_ANCHOR + ''.join(item[0] for item in patch.AUDIT_PATCHES)
        for anchor, _, label in patch.AUDIT_PATCHES:
            for count in (0, 2):
                with self.subTest(anchor=label, count=count):
                    with self.assertRaisesRegex(ValueError, f'exact {label} payload anchor'):
                        patch.patch_background(source.replace(anchor, anchor * count))

    def test_missing_reading_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact reading payload anchor'):
            patch.patch_background(patch.ANCHOR + patch.EVENT_ANCHOR + patch.COMPONENT_ANCHOR)

    def test_duplicate_reading_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact reading payload anchor'):
            patch.patch_background(patch.ANCHOR + patch.EVENT_ANCHOR + patch.EXT_READING_ANCHOR * 2 + patch.COMPONENT_ANCHOR)

    def test_missing_component_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact component payload anchor'):
            patch.patch_background(patch.ANCHOR + patch.EVENT_ANCHOR + patch.EXT_READING_ANCHOR)

    def test_duplicate_component_anchor_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'exact component payload anchor'):
            patch.patch_background(patch.ANCHOR + patch.EVENT_ANCHOR + patch.EXT_READING_ANCHOR + patch.COMPONENT_ANCHOR * 2)


if __name__ == '__main__':
    unittest.main()
