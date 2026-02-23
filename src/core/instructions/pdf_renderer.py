"""
PDF renderer for K'NexForge instructions.
Uses ReportLab to generate instruction booklets.
"""
from typing import List
from .generator import InstructionStep

# ReportLab import is optional until implemented




try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter as letter_size
except ImportError:
    canvas = None
    letter_size = (612.0, 792.0)  # Default US Letter size in points

def get_letter_size():
    if _letter_size is not None:
        return _letter_size
    return (612.0, 792.0)  # Default US Letter size in points

class PDFRenderer:
    """
    Renders instruction steps to a PDF file.
    """
    def __init__(self, steps: List[InstructionStep], output_path: str):
        self.steps = steps
        self.output_path = output_path

    def render(self):
        """
        Render the instruction steps to a PDF file at output_path.
        """
        if canvas is None:
            raise ImportError("ReportLab is required for PDF rendering. Please install reportlab.")
        width, height = letter_size
        c = canvas.Canvas(self.output_path, pagesize=letter_size)
        c.setFont("Helvetica", 16)
        c.drawString(72, height - 72, "K'NexForge Instructions")
        c.setFont("Helvetica", 12)
        y = height - 100
        for i, step in enumerate(self.steps):
            c.drawString(72, y, f"Step {i+1}: {step.description}")
            y -= 24
            if y < 100:
                c.showPage()
                y = height - 72
        c.save()
