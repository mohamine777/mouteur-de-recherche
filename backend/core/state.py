from indexing.inverted_index import InvertedIndex
from models.boolean import ExactBooleanModel, ExtendedBooleanModel, FuzzySetModel
from models.vsm import VectorSpaceModel
from utils.evaluation import Evaluator


class AppState:
    """In-memory singleton state for index and retrieval models."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.index = InvertedIndex()
            cls._instance.boolean_exact = ExactBooleanModel(cls._instance.index)
            cls._instance.vsm = VectorSpaceModel(cls._instance.index)
            cls._instance.boolean = ExtendedBooleanModel(cls._instance.index)
            cls._instance.fuzzy = FuzzySetModel(cls._instance.index)
            cls._instance.evaluator = Evaluator()
        return cls._instance


state = AppState()
