# scripts/tests/test_polygon_utils.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from extract_subject_polygons import (
    renormalize_polygon,
    compute_coverage_ratio,
    compute_metrics,
)


def test_renormalize_polygon_identity():
    # artwork_bounds fills full card → polygon coords unchanged
    bounds = {'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0}
    pts = [[0.25, 0.30], [0.75, 0.30], [0.75, 0.80], [0.25, 0.80]]
    result = renormalize_polygon(pts, bounds)
    assert result == pts


def test_renormalize_polygon_offset():
    # artwork_bounds at (0.1, 0.2, 0.8, 0.4)
    # crop-space point (0.5, 0.5) maps to card-space (0.1 + 0.5*0.8, 0.2 + 0.5*0.4) = (0.5, 0.4)
    bounds = {'x': 0.1, 'y': 0.2, 'w': 0.8, 'h': 0.4}
    pts = [[0.5, 0.5]]
    result = renormalize_polygon(pts, bounds)
    assert abs(result[0][0] - 0.5) < 1e-9
    assert abs(result[0][1] - 0.4) < 1e-9


def test_renormalize_polygon_corner():
    # crop-space (0, 0) maps to top-left of bounds in card space
    bounds = {'x': 0.07, 'y': 0.135, 'w': 0.86, 'h': 0.385}
    pts = [[0.0, 0.0]]
    result = renormalize_polygon(pts, bounds)
    assert abs(result[0][0] - 0.07) < 1e-9
    assert abs(result[0][1] - 0.135) < 1e-9


def test_compute_coverage_ratio_half():
    # polygon covers exactly half the art area height
    # art area w=0.5, h=0.5 → area = 0.25
    # polygon in card space: rect from (0, 0) to (0.5, 0.25) → area = 0.125 → ratio = 0.5
    bounds = {'x': 0.0, 'y': 0.0, 'w': 0.5, 'h': 0.5}
    polygon = [[0.0, 0.0], [0.5, 0.0], [0.5, 0.25], [0.0, 0.25]]
    ratio = compute_coverage_ratio(polygon, bounds)
    assert abs(ratio - 0.5) < 0.01


def test_compute_metrics_flags():
    # vertex_count < 5 → flagged
    metrics = compute_metrics(
        polygon=[[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
        bounds={'x': 0.0, 'y': 0.0, 'w': 1.0, 'h': 1.0},
        mean_alpha=230.0,
        contour_count=1,
    )
    assert metrics['vertex_count'] == 4
    assert metrics['flags']['vertex_count_low'] is True
    assert metrics['flags']['coverage_ok'] is True
    assert metrics['flags']['alpha_ok'] is True
    assert metrics['flags']['fragmented'] is False
