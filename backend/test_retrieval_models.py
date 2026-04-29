import unittest

from indexing.inverted_index import InvertedIndex
from models.boolean import ExactBooleanModel, ExtendedBooleanModel
from models.vsm import VectorSpaceModel


class RetrievalModelTests(unittest.TestCase):
    def setUp(self):
        self.index = InvertedIndex()
        self.index.add_document("d1", "cat cat dog", {"filename": "d1.txt"})
        self.index.add_document("d2", "cat", {"filename": "d2.txt"})
        self.index.add_document("d3", "dog", {"filename": "d3.txt"})

    def test_exact_boolean_supports_and_not_and_parentheses(self):
        model = ExactBooleanModel(self.index)

        and_results = model.search("cat AND dog")
        self.assertEqual([result["doc_id"] for result in and_results], ["d1"])
        self.assertEqual(and_results[0]["score"], 1)

        not_results = model.search("cat AND NOT dog")
        self.assertEqual([result["doc_id"] for result in not_results], ["d2"])
        self.assertEqual(not_results[0]["score"], 1)

        grouped_results = model.search("(cat OR dog) AND NOT mouse")
        self.assertEqual([result["doc_id"] for result in grouped_results], ["d1", "d2", "d3"])

    def test_extended_boolean_uses_strict_p_norm(self):
        model = ExtendedBooleanModel(self.index)
        results = model.search("cat OR dog", p=2.0)

        self.assertEqual(results[0]["doc_id"], "d1")
        self.assertGreater(results[0]["score"], results[1]["score"])
        self.assertGreater(results[1]["score"], 0.0)

    def test_vsm_supports_raw_tf_and_exact_measures(self):
        model = VectorSpaceModel(self.index)

        normalized_results = model.search(["cat"], measure="cosine", tf_mode="normalized")
        self.assertEqual(normalized_results[0]["doc_id"], "d2")

        raw_results = model.search(["cat"], measure="inner_product", tf_mode="raw")
        self.assertEqual(raw_results[0]["doc_id"], "d1")
        self.assertGreater(raw_results[0]["score"], raw_results[1]["score"])

        euclidean_results = model.search(["cat"], measure="euclidean_distance", tf_mode="normalized")
        self.assertEqual(euclidean_results[0]["doc_id"], "d2")


if __name__ == "__main__":
    unittest.main()
