"""Experimental weights: pip install fonttools==4.60.2 skia-python==144.1 brotli==1.2.1 skia-pathops==0.8.0.post2."""
from pathlib import Path
import hashlib
import json
import argparse

import skia
import pathops
from fontTools.pens.basePen import BasePen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = ROOT / 'frontend/tg/src/assets/fonts'
SOURCE = FONTS / 'seenonim-v1.ttf'
STYLES = {'thin': (100, -20), 'light': (300, -8), 'semibold': (600, 10), 'bold': (700, 18)}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('styles', nargs='+', choices=STYLES)
args = parser.parse_args()


class SkiaPen(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.path = skia.Path()

    def _moveTo(self, p):
        self.path.moveTo(*p)

    def _lineTo(self, p):
        self.path.lineTo(*p)

    def _curveToOne(self, a, b, c):
        self.path.cubicTo(*a, *b, *c)

    def _qCurveToOne(self, a, b):
        self.path.quadTo(*a, *b)

    def _closePath(self):
        self.path.close()

    def _endPath(self):
        pass


def to_glyph(path):
    target = TTGlyphPen(None)
    pen = Cu2QuPen(target, max_err=0.5, reverse_direction=False)
    iterator = skia.Path.RawIter(path)
    for verb, points in iterator:
        p = [tuple(point) for point in points]
        if verb == skia.Path.kMove_Verb:
            pen.moveTo(p[0])
        elif verb == skia.Path.kLine_Verb:
            pen.lineTo(p[1])
        elif verb == skia.Path.kQuad_Verb:
            pen.qCurveTo(*p[1:])
        elif verb == skia.Path.kConic_Verb:
            quads = skia.Path.ConvertConicToQuads(*points, iterator.conicWeight(), 3)
            for i in range(1, len(quads), 2):
                pen.qCurveTo(tuple(quads[i]), tuple(quads[i + 1]))
        elif verb == skia.Path.kCubic_Verb:
            pen.curveTo(*p[1:])
        elif verb == skia.Path.kClose_Verb:
            pen.closePath()
        else:
            raise ValueError(f'Unsupported path verb: {verb}')
    return target.glyph()


for style in args.styles:
    weight, offset = STYLES[style]
    label = 'SemiBold' if style == 'semibold' else style.title()
    OUTPUT = FONTS / f'seenonim-{style}-experimental.ttf'
    font = TTFont(SOURCE, recalcTimestamp=False)
    glyph_set = font.getGlyphSet()
    paint = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=abs(offset) * 2,
                       StrokeJoin=skia.Paint.kRound_Join)
    replacements = {}
    for name in font.getGlyphOrder():
        pen = SkiaPen(glyph_set)
        glyph_set[name].draw(pen)
        if pen.path.isEmpty():
            replacements[name] = to_glyph(pen.path)
            continue
        stroke = skia.Path()
        assert paint.getFillPath(pen.path, stroke)
        light = skia.Op(pen.path, stroke, (skia.PathOp.kDifference_PathOp if offset < 0 else skia.PathOp.kUnion_PathOp))
        assert not light.isEmpty(), f'Glyph disappeared: {name}'
        # Skia boolean operations return even-odd contours; TrueType needs winding.
        outline = pathops.Path()
        to_glyph(light).draw(outline.getPen(), None)
        outline.fillType = pathops.FillType.EVEN_ODD
        normalized = pathops.simplify(outline, clockwise=True)
        target = TTGlyphPen(None)
        normalized.draw(Cu2QuPen(target, max_err=0.5, reverse_direction=False))
        replacements[name] = target.glyph()


    for name, glyph in replacements.items():
        font['glyf'][name] = glyph
        glyph.recalcBounds(font['glyf'])
        advance, _ = font['hmtx'][name]
        font['hmtx'][name] = (advance, getattr(glyph, 'xMin', 0))

    # Original hinting and signatures no longer describe the modified outlines.
    for tag in ['fpgm', 'prep', 'cvt ', 'DSIG', 'LTSH', 'hdmx', 'VDMX']:
        if tag in font:
            del font[tag]
    font['gasp'].gaspRange = {65535: 10}
    font['OS/2'].usWeightClass = weight
    font['OS/2'].fsSelection &= ~((1 << 5) | (1 << 6))
    font['head'].macStyle &= ~1
    if weight == 700:
        font['OS/2'].fsSelection |= 1 << 5
        font['head'].macStyle |= 1
    names = {
        1: f'Seenonim Experimental {label}', 2: 'Bold' if weight == 700 else 'Regular',
        3: f'PickleHub:SeenonimExperimental-{label}:1.001',
        4: f'Seenonim Experimental {label}', 5: f'Version 1.001; experimental {style}',
        6: f'SeenonimExperimental-{label}',
        16: 'Seenonim Experimental', 17: label,
        10: f'Experimental mechanical {label} derived from Seenonim Regular by Rita Kolmykova. '
            f'Outline offset {offset} units; not an official designer weight.',
    }
    for key, value in names.items():
        font['name'].removeNames(nameID=key)
        font['name'].setName(value, key, 3, 1, 0x409)
        font['name'].setName(value, key, 1, 0, 0)
    font.save(OUTPUT)
    font.flavor = 'woff2'
    font.save(OUTPUT.with_suffix('.woff2'))

    original = TTFont(SOURCE)
    for path in [OUTPUT, OUTPUT.with_suffix('.woff2')]:
        result = TTFont(path, checkChecksums=2)
        assert result.getBestCmap() == original.getBestCmap()
        assert result.getGlyphOrder() == original.getGlyphOrder()
        assert result['OS/2'].usWeightClass == weight
        for tag in ['GSUB', 'GPOS', 'GDEF']:
            assert result[tag].compile(result) == original[tag].compile(original)
        for name in result.getGlyphOrder():
            assert result['hmtx'][name][0] == original['hmtx'][name][0]
            if original['glyf'][name].numberOfContours:
                assert result['glyf'][name].numberOfContours > 0, name
        print(path.relative_to(ROOT), path.stat().st_size, 'bytes: validation passed')
    print(json.dumps({'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                      'glyphs': len(original.getGlyphOrder()),
                      'mapped_characters': len(original.getBestCmap()), 'offset': offset}))

    original_glyphs = original.getGlyphSet()
    light_glyphs = TTFont(OUTPUT).getGlyphSet()
    ratios = []
    for name in original.getGlyphOrder():
        before, after = pathops.Path(), pathops.Path()
        original_glyphs[name].draw(before.getPen(glyphSet=original_glyphs))
        light_glyphs[name].draw(after.getPen(glyphSet=light_glyphs))
        before_area = abs(pathops.simplify(before).area)
        after_area = abs(pathops.simplify(after).area)
        if before_area:
            assert after_area > 0, f'Empty glyph: {name}'
            assert (after_area < before_area) == (offset < 0), f'Invalid weight: {name}'
            ratios.append(after_area / before_area)
    print(f'{len(ratios)} visible glyphs verified; area ratio {min(ratios):.3f}-{max(ratios):.3f}')
