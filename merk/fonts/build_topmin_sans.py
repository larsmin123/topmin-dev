"""Bouwt TOPMIN Sans: Funnel Sans met twee eigen ingrepen, in alle gewichten (300 tot 800).

1. De schuine streep staat zoals in het woordmerk TOP/MIN: van grondlijn tot kapitaalhoogte,
   onder dezelfde hoek.
2. Alle ronde punten (punt, dubbele punt, i, j, trema, uitroepteken, vraagteken, beletselteken)
   zijn vierkant, net als de kop van de komma die Funnel al heeft.

Bron: bron/FunnelSans-wght.ttf, Copyright 2023 The Funnel Project Authors, SIL Open Font
License 1.1 (zie OFL.txt). De variant valt onder dezelfde licentie en heeft een eigen naam.

Gebruik:  python3 build_topmin_sans.py
Nodig:    fonttools, brotli
"""

import os

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
from fontTools.ttLib.tables.TupleVariation import TupleVariation
from fontTools.varLib import instancer

FAMILY = "TOPMIN Sans"
PS_FAMILY = "TOPMINSans"
BOLD_WEIGHT = 800            # het zwaarste gewicht van de bron
SLASH_RUN = 0.40             # uit het logo: 40 opzij op 100 omhoog
SLASH_SIDE = 15              # witruimte links en rechts van de streep
DOT_SIDE = 120 / 144         # zijde van het vierkant gedeeld door de middellijn van de punt;
                             # zo is de punt even breed als de kop van de komma
DOT_MAX = 260                # grotere ronde vormen zijn geen punten
ON_CURVE = 1


def contours_of(glyph):
    out, start = [], 0
    for end in glyph.endPtsOfContours:
        out.append(range(start, end + 1))
        start = end + 1
    return out


def box(coords, points):
    xs = [coords[i][0] for i in points]
    ys = [coords[i][1] for i in points]
    return min(xs), min(ys), max(xs), max(ys)


def clockwise(coords, points):
    pts = [coords[i] for i in points]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return area < 0


def is_dot(glyph, k, all_contours):
    """Een losse, kleine, ronde omtrek: even breed als hoog, met bochten, niets erin of eromheen."""
    points = all_contours[k]
    x0, y0, x1, y1 = box(glyph.coordinates, points)
    if x1 - x0 > DOT_MAX or abs((x1 - x0) - (y1 - y0)) > 4:
        return False
    if all(glyph.flags[i] & ON_CURVE for i in points):
        return False
    for j, other in enumerate(all_contours):
        if j == k:
            continue
        ox0, oy0, ox1, oy1 = box(glyph.coordinates, other)
        if (ox0 > x0 and oy0 > y0 and ox1 < x1 and oy1 < y1) or \
           (ox0 < x0 and oy0 < y0 and ox1 > x1 and oy1 > y1):
            return False
    return True


def square(bounds, cw):
    x0, y0, x1, y1 = bounds
    half = (x1 - x0) * DOT_SIDE / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    pts = [(cx - half, cy - half), (cx - half, cy + half), (cx + half, cy + half), (cx + half, cy - half)]
    return pts if cw else pts[::-1]


def slash(cap, stem_width, mirrored, advance):
    run = cap * SLASH_RUN
    x = SLASH_SIDE
    pts = [(x, 0), (x + run, cap), (x + run + stem_width, cap), (x + stem_width, 0)]
    if mirrored:
        pts = [(advance - px, py) for px, py in pts][::-1]
    return pts


def rebuild(font, name, light, bold, advances):
    """Zet nieuwe omtrekken (licht en zwaar) in het lettertype; de tussenliggende gewichten volgen."""
    glyph = font["glyf"][name]
    coords, flags, ends = [], [], []
    deltas = []
    for contour_light, contour_bold, contour_flags in zip(light, bold, flags_of(light, glyph)):
        for (lx, ly), (bx, by), flag in zip(contour_light, contour_bold, contour_flags):
            lx, ly = round(lx), round(ly)
            coords.append((lx, ly))
            flags.append(flag)
            deltas.append((round(bx) - lx, round(by) - ly))
        ends.append(len(coords) - 1)
    glyph.coordinates = GlyphCoordinates(coords)
    glyph.flags = bytearray(flags)
    glyph.endPtsOfContours = ends
    glyph.numberOfContours = len(ends)
    glyph.program = None
    if hasattr(glyph, "program"):
        del glyph.program
    from fontTools.ttLib.tables import ttProgram
    glyph.program = ttProgram.Program()
    glyph.program.fromBytecode(b"")
    glyph.recalcBounds(font["glyf"])
    adv_light, adv_bold = advances
    deltas += [(0, 0), (adv_bold - adv_light, 0), (0, 0), (0, 0)]   # de vier meetpunten
    font["gvar"].variations[name] = [TupleVariation({"wght": (0.0, 1.0, 1.0)}, deltas)]
    font["hmtx"][name] = (adv_light, glyph.xMin)


def flags_of(contours, glyph):
    """Vlaggen per omtrek: nieuwe omtrekken zijn recht, bestaande houden hun eigen vlaggen."""
    return [c.flags if isinstance(c, Kept) else [ON_CURVE] * len(c) for c in contours]


class Kept(list):
    """Een omtrek die ongewijzigd blijft, met zijn oorspronkelijke vlaggen."""
    flags = None


def kept(coords, points, flags=None):
    out = Kept(coords[i] for i in points)
    out.flags = [flags[i] for i in points] if flags is not None else None
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    source = os.path.join(here, "bron", "FunnelSans-wght.ttf")
    font = TTFont(source)
    heavy = instancer.instantiateVariableFont(TTFont(source), {"wght": BOLD_WEIGHT})
    glyf, glyf_heavy = font["glyf"], heavy["glyf"]
    cap = font["OS/2"].sCapHeight
    changed = []

    # 1. Vierkante punten
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.isComposite() or glyph.numberOfContours <= 0:
            continue
        all_contours = contours_of(glyph)
        dots = [k for k in range(len(all_contours)) if is_dot(glyph, k, all_contours)]
        if not dots:
            continue
        glyph_heavy = glyf_heavy[name]
        light, bold = [], []
        for k, points in enumerate(all_contours):
            if k in dots:
                cw = clockwise(glyph.coordinates, points)
                light.append(square(box(glyph.coordinates, points), cw))
                bold.append(square(box(glyph_heavy.coordinates, points), cw))
            else:
                light.append(kept(glyph.coordinates, points, glyph.flags))
                bold.append(kept(glyph_heavy.coordinates, points))
        rebuild(font, name, light, bold, (font["hmtx"][name][0], heavy["hmtx"][name][0]))
        changed.append(name)

    # 2. De schuine streep uit het logo
    stem_light = glyf["slash"].coordinates[3][0] - glyf["slash"].coordinates[0][0]
    stem_bold = glyf_heavy["slash"].coordinates[3][0] - glyf_heavy["slash"].coordinates[0][0]
    adv_light = round(2 * SLASH_SIDE + cap * SLASH_RUN + stem_light)
    adv_bold = round(2 * SLASH_SIDE + cap * SLASH_RUN + stem_bold)
    for name, mirrored in (("slash", False), ("backslash", True)):
        rebuild(font, name,
                [slash(cap, stem_light, mirrored, adv_light)],
                [slash(cap, stem_bold, mirrored, adv_bold)],
                (adv_light, adv_bold))
        changed.append(name)
    set_advance_delta(font, ("slash", "backslash"), adv_bold - adv_light)

    rename(font)
    out = os.path.join(here, "TopMinSans-wght.ttf")
    font.save(out)
    web = TTFont(out)
    web.flavor = "woff2"
    web.save(os.path.join(here, "TopMinSans-wght.woff2"))
    return changed, out


def set_advance_delta(font, names, delta):
    """De breedte van de streep groeit mee met het gewicht; HVAR moet dat ook weten."""
    hvar = font["HVAR"].table
    order = font.getGlyphOrder()
    store = hvar.VarStore
    region_count = len(store.VarRegionList.Region)
    assert region_count == 1, "onverwachte opbouw van HVAR"
    for name in names:
        gid = order.index(name)
        index = hvar.AdvWidthMap.mapping[name] if hvar.AdvWidthMap else gid
        outer, inner = index >> 16, index & 0xFFFF
        data = store.VarData[outer]
        # Een eigen rij, zodat andere tekens met dezelfde rij niet meeveranderen.
        data.Item.append([delta] + [0] * (len(data.Item[inner]) - 1))
        data.ItemCount = len(data.Item)
        new_index = (outer << 16) + data.ItemCount - 1
        if hvar.AdvWidthMap:
            hvar.AdvWidthMap.mapping[name] = new_index
        else:
            raise AssertionError("HVAR zonder breedtekaart: rij kan niet apart gezet worden")
        data.calculateNumShorts(optimize=False)


def rename(font):
    for record in font["name"].names:
        text = record.toUnicode()
        if record.nameID in (1, 3, 4, 6, 16, 25):
            text = text.replace("Funnel Sans", FAMILY).replace("FunnelSans", PS_FAMILY).replace("DICO", "TPMN")
            record.string = text
    font["name"].setName(
        "TOPMIN Sans is een bewerking van Funnel Sans (The Funnel Project Authors), "
        "SIL Open Font License 1.1.", 10, 3, 1, 0x409)


if __name__ == "__main__":
    names, path = main()
    print(len(names), "tekens aangepast:", " ".join(names))
    print("geschreven naar", path)
