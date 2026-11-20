// HTML / CSS2D-style labels so Arabic and Latin both shape correctly in the browser.
import * as THREE from 'three';

export function makeLabelLayer(rootEl) {
  const root = rootEl || document.getElementById('labels');
  const items = [];
  const v = new THREE.Vector3();

  function add(kind = '') {
    const el = document.createElement('div');
    el.className = 'name-tag' + (kind ? ' ' + kind : '');
    el.innerHTML = '<strong></strong><small></small>';
    root.appendChild(el);
    const item = {
      el,
      kind,
      world: new THREE.Vector3(),
      visible: true,
      set(title, sub) {
        el.querySelector('strong').textContent = title || '';
        const sm = el.querySelector('small');
        if (sub) {
          sm.textContent = sub;
          sm.hidden = false;
        } else {
          sm.textContent = '';
          sm.hidden = true;
        }
      },
      setWorld(x, y, z) {
        item.world.set(x, y, z);
      },
      show(on) {
        item.visible = !!on;
        if (!on) el.style.display = 'none';
      },
      remove() {
        el.remove();
        const i = items.indexOf(item);
        if (i >= 0) items.splice(i, 1);
      },
    };
    items.push(item);
    return item;
  }

  function update(camera, width, height) {
    if (camera && camera.updateMatrixWorld) camera.updateMatrixWorld();
    for (const item of items) {
      if (!item.visible) {
        item.el.style.display = 'none';
        continue;
      }
      v.copy(item.world).project(camera);
      if (v.z < -1.05 || v.z > 1.05) {
        item.el.style.display = 'none';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      if (x < -120 || y < -120 || x > width + 120 || y > height + 120) {
        item.el.style.display = 'none';
        continue;
      }
      const anchor = item.kind === 'caption' ? 'translate(-50%, 16%)' : 'translate(-50%, -100%)';
      item.el.style.display = 'block';
      item.el.style.transform = `${anchor} translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  }

  function clear() {
    while (items.length) {
      const it = items.pop();
      it.el.remove();
    }
  }

  return { add, update, clear, root, items };
}
