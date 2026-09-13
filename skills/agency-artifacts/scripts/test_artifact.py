import copy
import json
from pathlib import Path
import tempfile
import unittest
import yaml
import artifact

class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.meta = artifact.draft('Бриф', 'content')
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def approved(self):
        m=copy.deepcopy(self.meta);m.update(project_id='project-test', task_ref={'system':'bb-task','id':'TEST-1'},owner={'kind':'human','id':'owner-test'},status='approved',review={'mode':'human','reviewer':{'kind':'human','id':'reviewer-test'},'decided_at':m['updated_at'],'decision_ref':'checks/decision.json'});return m
    def test_draft_unknowns(self): self.assertEqual(artifact.validate_meta(self.meta),[])
    def test_md_roundtrip(self):
        p=self.root/'brief.md';artifact.init(p,'md','Бриф','content');self.assertEqual(artifact.validate(p),[])
    def test_json_roundtrip(self):
        p=self.root/'brief.json';artifact.init(p,'json','Бриф','content');self.assertIn('_meta',json.loads(p.read_text()));self.assertEqual(artifact.validate(p),[])
    def test_refuse_overwrite(self):
        p=self.root/'a.md';p.write_text('original');self.assertRaises(FileExistsError,artifact.init,p,'md','Бриф','content');self.assertEqual(p.read_text(),'original')
    def test_approved_has_review(self):
        m=self.approved();self.assertEqual(artifact.validate_meta(m),[]);m.pop('review');self.assertTrue(artifact.validate_meta(m))
    def test_approved_real_bindings(self):
        for key in ['project_id','task_ref']:
            m=self.approved();m[key]=None;self.assertTrue(artifact.validate_meta(m))
    def test_unknown_owner_not_ready(self):
        m=self.approved();m['owner']['id']=None;self.assertTrue(artifact.validate_meta(m))
    def test_template_not_approved(self):
        m=self.approved();m['scope']='template';self.assertTrue(artifact.validate_meta(m))
    def test_task_status_not_document_status(self):
        m=self.meta;m['status']='running';self.assertTrue(artifact.validate_meta(m))
    def test_dates(self):
        for value in ['yesterday','2026-09-14T12:00:00','bad']:
            m=copy.deepcopy(self.meta);m['updated_at']=value;self.assertTrue(artifact.validate_meta(m))
    def test_time_order(self):
        m=self.meta;m['updated_at']='2020-01-01T00:00:00Z';self.assertTrue(artifact.validate_meta(m))
    def test_blocker_required(self):
        m=self.meta;m['status']='blocked';self.assertTrue(artifact.validate_meta(m));m['blockers']=['Missing source'];self.assertEqual(artifact.validate_meta(m),[])
    def test_versioned_dependencies(self):
        m=self.meta;m['depends_on']=[{'artifact_id':'art_input','path':'input.md'}];self.assertTrue(artifact.validate_meta(m));m['depends_on'][0]['version']=2;self.assertEqual(artifact.validate_meta(m),[])
    def test_yaml_before_json_rejected(self):
        p=self.root/'bad.json';p.write_text('---\ntitle: bad\n---\n{}');self.assertRaises(ValueError,artifact.read_meta,p)
    def test_duplicate_json(self):
        p=self.root/'bad.json';p.write_text('{"_meta":{},"_meta":{}}');self.assertRaises(ValueError,artifact.read_meta,p)
    def test_duplicate_yaml(self):
        p=self.root/'bad.md';p.write_text('---\nstatus: draft\nstatus: approved\n---\n');self.assertRaises(ValueError,artifact.read_meta,p)
    def test_sidecar_keeps_original(self):
        raw=self.root/'queries.jsonl';raw.write_text('{"query":"example"}\n');p=self.root/'queries.jsonl.meta.json';m=self.meta;m['target']='queries.jsonl';p.write_text(json.dumps(m));self.assertEqual(artifact.validate(p),[]);self.assertEqual(raw.read_text(),'{"query":"example"}\n')
    def test_missing_sidecar_target(self):
        p=self.root/'file.meta.json';p.write_text(json.dumps(self.meta));self.assertRaises(ValueError,artifact.read_meta,p)
    def test_unrelated_raw_rejected(self):
        p=self.root/'raw.csv';p.write_text('a,b\n1,2');self.assertRaises(ValueError,artifact.read_meta,p)
    def test_yaml_unsafe_tag(self):
        p=self.root/'bad.md';p.write_text('---\nx: !!python/object/apply:os.system ["false"]\n---\n');self.assertRaises(yaml.YAMLError,artifact.read_meta,p)
    def test_shared_document_without_task(self):
        m=self.approved();m.update(scope='shared',project_id=None,task_ref=None);self.assertEqual(artifact.validate_meta(m),[])
    def test_strict_json_numbers(self):
        p=self.root/"bad.json";p.write_text(json.dumps({"_meta":self.meta,"data":float("nan")}));self.assertRaises(ValueError,artifact.read_meta,p)
    def test_nonstring_yaml_key(self):
        p=self.root/"bad.md";p.write_text("---\n? [a, b]\n: value\n---\n");self.assertRaises(ValueError,artifact.read_meta,p)
    def test_examples(self):
        for f in ['document.example.md','document.example.json']:
            self.assertEqual(artifact.validate(artifact.BASE/'assets'/f),[])

if __name__=='__main__': unittest.main()
