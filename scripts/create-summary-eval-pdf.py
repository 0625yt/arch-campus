"""Synthetic 100-page source, unique facts per page; requires reportlab."""
from pathlib import Path
from textwrap import wrap
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

path = Path("tmp/pdfs/coverage-100-pages.pdf")
path.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(path), pagesize=A4)
for n in range(1, 101):
    c.setFont("Helvetica-Bold", 18)
    c.drawString(48, 790, f"Module {n:03d} - source page {n}")
    c.setFont("Helvetica", 11)
    y = 755
    paragraphs = [
        f"Module {n:03d} requires an inspection every {n+10} days. Its unique safety threshold is {n*7+3} units. When the threshold is exceeded, stop the device before inspection.",
        f"The procedure for Module {n:03d} is: record the current reading, compare the reading with the threshold, then stop or continue operation. Do not replace the comparison with a calendar check.",
        f"For Module {n:03d}, method A uses {n+2} samples and method B uses {n+5} samples. Method A is used for a quick check. Method B is used for a detailed check. Both require the same safety threshold.",
        f"Exception for Module {n:03d}: if the sensor is disconnected, the reading is unknown. Never interpret an unknown reading as zero. Reconnect and measure again before making an operation decision.",
        f"Review objective {n:03d}: explain the order of the procedure, compare the two sampling methods, retain the threshold and the disconnected-sensor exception. This module is independent of the other modules.",
    ]
    for paragraph in paragraphs:
        for line in wrap(paragraph, 85):
            c.drawString(48, y, line)
            y -= 17
        y -= 16
    c.setFont("Helvetica", 10)
    c.drawString(48, 35, f"Synthetic evaluation source | {n}/100")
    c.showPage()
c.save()
print(path)
