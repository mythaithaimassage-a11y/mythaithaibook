function smoothOutline(points) {
  const middle = (first, second) => [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
  const start = middle(points.at(-1), points[0]);
  return `M ${start.join(' ')} ${points.map((point, index) => {
    const end = middle(point, points[(index + 1) % points.length]);
    return `Q ${point.join(' ')} ${end.join(' ')}`;
  }).join(' ')} Z`;
}

// Project connected anatomical cross-sections rather than separate joint ellipsoids.
export function anatomicalBodyParts(bodyType, angle) {
  const female = bodyType === 'female';
  const male = bodyType === 'male';
  const shoulder = female ? 32 : male ? 40 : 36;
  const hip = female ? 34 : male ? 29 : 31;
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const project = (x, z) => x * cos + z * sin;
  const parts = [
    { id: 'head', areas: ['Head / face'], sections: [
      [8, 0, 0, 0, 0], [10, 12, 14, 0, 0], [20, 18, 19, 0, 0],
      [33, 17, 20, 0, 1], [43, 12, 14, 0, 2], [49, 5, 7, 0, 2],
    ] },
    { id: 'upper-torso', areas: ['Neck', 'Shoulders', 'Upper back', 'Lower back', 'Chest / abdomen', 'Hips / glutes'], sections: [
      [46, 6, 7, 0, 0], [59, 8, 8, 0, 0], [67, 15, 10, 0, 0],
      [74, shoulder, 14, 0, 0], [84, shoulder - 2, 18, 0, 0],
      [105, shoulder - 5, 20, 0, 0], [132, female ? 22 : 27, 16, 0, 0],
      [157, female ? 23 : 26, 17, 0, 0], [180, hip, 20, 0, -1],
      [198, hip - 2, 18, 0, -1], [210, 15, 11, 0, 0],
    ] },
    ...[-1, 1].flatMap((side) => [
      { id: `arm-${side}`, areas: ['Shoulders', 'Arms / hands'], sections: [
        [76, 9, 10, side * (shoulder - 1), 0],
        [88, 10, 10, side * (shoulder + 5), 0],
        [111, 8, 8, side * (shoulder + 9), 0],
        [141, 6, 6, side * (shoulder + 12), 1],
        [155, 7, 7, side * (shoulder + 13), 2],
        [180, 5, 5, side * (shoulder + 14), 3],
        [193, 4, 4, side * (shoulder + 15), 4],
        [200, 6, 4, side * (shoulder + 16), 4],
        [212, 5, 3, side * (shoulder + 17), 4],
        [222, 2, 2, side * (shoulder + 17), 4],
      ] },
      { id: `leg-${side}`, areas: ['Legs / knees', 'Feet'], sections: [
        [193, female ? 16 : 14, 16, side * 16, 0],
        [215, 15, 15, side * 16, 0], [241, 12, 12, side * 16, 0],
        [273, 8, 9, side * 16, 1], [285, 8, 9, side * 16, 1],
        [303, 10, 10, side * 15, -1], [324, 7, 8, side * 15, -1],
        [344, 4, 5, side * 15, 0], [352, 6, 12, side * 15, 6],
        [360, 7, 15, side * 15, 9], [363, 3, 8, side * 15, 10],
      ] },
    ]),
  ];
  return parts.map((part) => {
    const contours = part.sections.map(([y, width, radius, x, z]) => {
      const centre = project(x, z);
      const halfWidth = Math.sqrt((width * cos) ** 2 + (radius * sin) ** 2);
      return { y, left: centre - halfWidth, right: centre + halfWidth, depth: -x * sin + z * cos };
    });
    const outline = [
      ...contours.map(({ left, y }) => [left, y]),
      ...contours.slice().reverse().map(({ right, y }) => [right, y]),
    ];
    return { id: part.id, areas: part.areas, path: smoothOutline(outline), depth: contours.reduce((sum, item) => sum + item.depth, 0) / contours.length };
  }).sort((first, second) => first.depth - second.depth);
}
