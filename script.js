function toggleConfigInfo() {
    const configInfo = document.getElementById('configInfo');
    const isVisible = window.getComputedStyle(configInfo).display !== 'none';
    configInfo.style.display = isVisible ? 'none' : 'block';
}

function toggleInfo() {
    const infoContent = document.getElementById('infoContent');
    const isVisible = window.getComputedStyle(infoContent).display !== 'none';
    infoContent.style.display = isVisible ? 'none' : 'block';
}

function toggleAIInfo() {
    const aiInfoContent = document.getElementById('aiInfoContent');
    const isVisible = window.getComputedStyle(aiInfoContent).display !== 'none';
    aiInfoContent.style.display = isVisible ? 'none' : 'block';
}

let baseUrl = "https://services.sentinel-hub.com/ogc/wmts/";
let map = null;
let xyzLayer = null;
let lastErrorZoomLevel = null; // Track zoom level for error message display
let errorUpdateTimeout = null; // Prevent spam from multiple tiles

// AI Code Generation Prompt Builder logic
const mapLibrarySelect = document.getElementById('mapLibrary');
const baseLayerSelect = document.getElementById('baseLayer');
const libraryOptionsDiv = document.getElementById('librarySpecificOptions');
const aiPromptText = document.getElementById('aiPromptText');
const layerNameInput = document.getElementById('layerName');

let aiSelectedLayerData = {
    xyz: 'https://services.sentinel-hub.com/ogc/wmts/e584849a-8729-4a4f-ab35-be5120a10e3b?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=3_NDVI&STYLE=default&FORMAT=image%2Fpng&TILEMATRIXSET=PopularWebMercator256&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    center: '-123.138018, 48.130306',
    zoom: '13',
    layerName: 'NDVI'
};

function toggleSettings() {
    const settings = document.getElementById('settings');
    settings.classList.toggle('expanded');
}

function updateBaseUrl() {
    const selectedService = document.querySelector('input[name="service"]:checked').value;
    baseUrl = selectedService === 'services' 
        ? "https://services.sentinel-hub.com/ogc/wmts/" 
        : "https://services-uswest2.sentinel-hub.com/ogc/wmts/";
    getLayers();
}

function getXYZUrl(id, identifier) {
    const parameters = `?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=${encodeURIComponent(identifier)}&STYLE=default&FORMAT=image%2Fpng&TILEMATRIXSET=PopularWebMercator256&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
    return baseUrl + id + parameters;
}

function generateUrl(identifier) {
    const id = document.getElementById('id').value.trim();
    const fullUrl = getXYZUrl(id, identifier);

    const generatedUrlsDiv = document.getElementById('generatedUrls');
    generatedUrlsDiv.innerHTML = '';

    const urlElement = document.createElement('div');
    urlElement.innerHTML = `<a href="${fullUrl}" target="_blank">${fullUrl}</a>`;
    generatedUrlsDiv.appendChild(urlElement);

    return fullUrl;
}

function getLayers(configId, layerTitleFromHash = null) {
    const idInput = document.getElementById('id');
    // If configId is not provided, use the input field's value
    const currentId = configId || idInput.value.trim();

    const serviceTitleDiv = document.getElementById('serviceTitle');
    const layerInfoDiv = document.getElementById('layerInfo');
    const generatedUrlsDiv = document.getElementById('generatedUrls');
    const coordsDiv = document.getElementById('layerCoordinates');
    const mapDiv = document.getElementById('map');
    const xyzDiv = document.getElementById('xyzTemplate');
    
    serviceTitleDiv.innerHTML = '';
    layerInfoDiv.innerHTML = '';
    generatedUrlsDiv.innerHTML = '';
    coordsDiv.innerHTML = '';
    mapDiv.style.display = 'none';
    xyzDiv.innerHTML = '';
    
    if (map) {
        map.setTarget(null);
        map = null;
    }

    if (!currentId) {
        layerInfoDiv.innerHTML = 'Please enter an ID.';
        if (window.location.hash) { // Clear hash only if it was set
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
    }

    // Only update hash if layerTitleFromHash is not provided (i.e., user typed ID)
    // Or if the hash doesn't already reflect the currentId and potential layer
    const currentHash = window.location.hash.substring(1);
    const expectedHashBase = `id/${currentId}`;
    if (!layerTitleFromHash && !currentHash.startsWith(expectedHashBase)) {
         window.history.replaceState(null, '', `#${expectedHashBase}`);
    }


    layerInfoDiv.innerHTML = '<p class="loading">Loading...</p>';

    const url = `${baseUrl}${currentId}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`;

    fetch(url)
        .then(response => response.text())
        .then(str => {
            const parser = new window.DOMParser();
            const xmlDoc = parser.parseFromString(str, "text/xml");

            const exceptionText = xmlDoc.querySelector('ows\\:ExceptionText, ExceptionText');
            if (exceptionText) {
                throw new Error(exceptionText.textContent);
            }

            const titleElement = xmlDoc.querySelector('ows\\:Title, Title');
            if (titleElement) {
                let serviceTitle = titleElement.textContent.replace('Sentinel Hub WMTS service - ', '');
                serviceTitleDiv.innerHTML = `<h2>${serviceTitle}</h2>`;
                document.getElementById('configNameLabel').style.display = '';
            } else {
                document.getElementById('configNameLabel').style.display = 'none';
            }

            const layers = xmlDoc.querySelectorAll('Layer');
            layerInfoDiv.innerHTML = '';

            const layerHintDiv = document.getElementById('layerHint');
            if (layers.length > 0) {
                layerHintDiv.textContent = 'Click on a layer for more information';
                layerHintDiv.style.display = '';
            } else {
                layerHintDiv.style.display = 'none';
            }

            if (layers.length > 0) {
                const labelDiv = document.createElement('div');
                labelDiv.className = 'layer-list-label';
                labelDiv.textContent = 'Available Layers';
                layerInfoDiv.appendChild(labelDiv);
            }

            const layersArray = Array.from(layers);

            layersArray.forEach((layer) => {
                const title = layer.querySelector('Title').textContent;
                const abstract = layer.querySelector('Abstract').textContent;
                // const identifier = layer.querySelector('Identifier').textContent;

                const layerDiv = document.createElement('div');
                layerDiv.className = 'layer';
                if (title === abstract) {
                    layerDiv.innerHTML = `<div class="layer-title">${title}</div>`;
                } else {
                    layerDiv.innerHTML = `<div class="layer-title">${title}</div><div class="layer-abstract">${abstract}</div>`;
                }
                layerDiv.onclick = function() {
                    selectLayer(layerDiv, layer, currentId);
                };
                layerInfoDiv.appendChild(layerDiv);
            });
            
            let layerSelectedBasedOnHash = false;
            if (layerTitleFromHash) {
                const decodedLayerTitle = decodeURIComponent(layerTitleFromHash);
                const layerToSelect = layersArray.find(layer => 
                    layer.querySelector('Title').textContent === decodedLayerTitle
                );
                if (layerToSelect) {
                    const layerDivs = layerInfoDiv.querySelectorAll('.layer');
                    for (const div of layerDivs) {
                        if (div.querySelector('.layer-title').textContent === decodedLayerTitle) {
                            selectLayer(div, layerToSelect, currentId);
                            layerSelectedBasedOnHash = true;
                            break;
                        }
                    }
                }
            }
            
            if (!layerSelectedBasedOnHash && layersArray.length === 1) {
                const firstLayerDiv = layerInfoDiv.querySelector('.layer');
                if (firstLayerDiv) {
                    selectLayer(firstLayerDiv, layersArray[0], currentId);
                }
            }
        })
        .catch(error => {
            console.error('Error fetching or parsing:', error);
            layerInfoDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
            // Clear hash on error if it was for this ID
            if (window.location.hash.includes(`id/${currentId}`)) {
                 window.history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        });
}

function selectLayer(layerDiv, layer, currentConfigId) {
    const previousSelectedLayer = document.querySelector('.layer.selected');
    if (previousSelectedLayer) {
        previousSelectedLayer.classList.remove('selected');
    }
    layerDiv.classList.add('selected');
    document.getElementById('layerHint').style.display = 'none';
    displayLayerCoordinates(layer);
    displayXYZTemplate(layer);
    
    const centerAndZoom = calculateCenterAndZoom(layer);
    const identifier = layer.querySelector('Identifier').textContent;
    const title = layer.querySelector('Title').textContent;
    const idForXYZ = document.getElementById('id').value.trim(); // Use current input value for XYZ
    const xyzUrl = getXYZUrl(idForXYZ, identifier);
    
    if (layerNameInput) {
        layerNameInput.value = title;
    }
    
    aiSelectedLayerData = {
        xyz: xyzUrl,
        center: `${centerAndZoom.lon.toFixed(6)}, ${centerAndZoom.lat.toFixed(6)}`,
        zoom: `${centerAndZoom.zoom}`,
        layerName: title
    };
    
    document.getElementById('aiPromptBuilder').style.display = 'block';
    
    const encodedLayerTitle = encodeURIComponent(title);
    window.history.replaceState(null, '', `#id/${currentConfigId}/layer/${encodedLayerTitle}`);
    
    updatePrompt();
}

function lonLatToXY(lon, lat) {
    const x = (lon + 180) / 360;
    const y = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
    return { x, y };
}

function calculateCenterAndZoom(layer) {
    const boundingBox = layer.querySelector('WGS84BoundingBox');
    const lowerCorner = boundingBox.querySelector('LowerCorner').textContent.split(' ');
    const upperCorner = boundingBox.querySelector('UpperCorner').textContent.split(' ');
    const lonMin = parseFloat(lowerCorner[0]);
    const latMin = parseFloat(lowerCorner[1]);
    const lonMax = parseFloat(upperCorner[0]);
    const latMax = parseFloat(upperCorner[1]);

    const lon = (lonMin + lonMax) / 2;
    const lat = (latMin + latMax) / 2;

    // Get map container dimensions
    const mapContainer = document.getElementById('map');
    const mapWidth = mapContainer.offsetWidth || 600; // fallback width
    const mapHeight = mapContainer.offsetHeight || 400; // fallback height

    // Calculate the span in degrees
    const lonSpan = lonMax - lonMin;
    const latSpan = latMax - latMin;

    // Convert lat span to approximate pixel equivalent at the center latitude
    // At latitude 0, 1 degree = ~111,320 meters = ~111.32 km
    // We need to account for latitude distortion using cos(lat)
    const centerLatRad = (lat * Math.PI) / 180;
    const metersPerDegreeLon = 111320 * Math.cos(centerLatRad);
    const metersPerDegreeLat = 111320;

    // Calculate approximate meters
    const widthInMeters = lonSpan * metersPerDegreeLon;
    const heightInMeters = latSpan * metersPerDegreeLat;

    // Calculate zoom level needed to fit the bounds
    // At zoom level z, the number of pixels per meter at the equator is: 2^z * 256 / 40075017
    // But we need to adjust for latitude
    const equatorCircumference = 40075017; // meters
    
    // Calculate required zoom to fit width and height with some padding
    const paddingFactor = 0.8; // Use 80% of container to leave some margin
    const zoomForWidth = Math.log2((mapWidth * paddingFactor * equatorCircumference) / (widthInMeters * 256));
    const zoomForHeight = Math.log2((mapHeight * paddingFactor * equatorCircumference) / (heightInMeters * 256));
    
    // Use the minimum zoom level to ensure both dimensions fit
    let zoom = Math.min(zoomForWidth, zoomForHeight);
    
    // Adjust for latitude distortion
    zoom = zoom + Math.log2(Math.cos(centerLatRad));
    
    // Clamp zoom to reasonable bounds and round down
    zoom = Math.max(1, Math.min(18, Math.floor(zoom)));

    return { lon, lat, zoom };
}

function initMap(center, zoom, xyzUrl) {
    const mapContainer = document.getElementById('map');
    mapContainer.style.display = 'block';
    
    // Convert from WGS84 [longitude, latitude] to Web Mercator [x, y]
    const centerWebMercator = ol.proj.fromLonLat([center.lon, center.lat]);
    
    // Create Carto basemap layer (Voyager with labels)
    const cartoLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            attributions: '&copy; <a href="https://carto.com/attributions">CARTO</a>'
        })
    });
    
    // Create XYZ layer from the provided URL with error handling
    xyzLayer = new ol.layer.Tile({
        source: new ol.source.XYZ({
            url: xyzUrl,
            tileLoadFunction: function(tile, src) {
                const img = tile.getImage();
                img.onload = function() {
                    // Tile loaded successfully - clear any error message and reset tracking
                    hideResolutionError();
                    lastErrorZoomLevel = null;
                };
                img.onerror = function() {
                    // Check if this is a resolution error
                    fetch(src)
                        .then(response => response.text())
                        .then(text => {
                            if (text.includes('meters per pixel exceeds the limit')) {
                                const currentZoom = map.getView().getZoom();
                                const currentZoomLevel = Math.floor(currentZoom);
                                
                                // Clear any existing timeout to prevent spam
                                if (errorUpdateTimeout) {
                                    clearTimeout(errorUpdateTimeout);
                                }
                                
                                // Update error message after a brief delay to prevent multiple updates
                                errorUpdateTimeout = setTimeout(() => {
                                    showResolutionError(text, currentZoom);
                                    lastErrorZoomLevel = currentZoomLevel;
                                    errorUpdateTimeout = null;
                                }, 150);
                            }
                        })
                        .catch(() => {
                            // If we can't fetch the error details, just ignore
                        });
                };
                img.src = src;
            }
        })
    });
    
    // Initialize map
    if (map) {
        map.setTarget(null);
    }
    
    map = new ol.Map({
        target: 'map',
        layers: [cartoLayer, xyzLayer],
        view: new ol.View({
            center: centerWebMercator,
            zoom: zoom
        })
    });

    // Add expand control
    const expandControl = document.createElement('div');
    expandControl.className = 'map-expand-control';
    expandControl.innerHTML = '<i class="fa-solid fa-expand"></i>';
    expandControl.title = 'Expand/Collapse Map';
    expandControl.addEventListener('click', function() {
        if (mapContainer.classList.contains('expanded')) {
            mapContainer.classList.remove('expanded');
            expandControl.innerHTML = '<i class="fa-solid fa-expand"></i>';
        } else {
            mapContainer.classList.add('expanded');
            expandControl.innerHTML = '<i class="fa-solid fa-compress"></i>';
        }
        // Update map size after expanding/collapsing
        setTimeout(() => {
            map.updateSize();
        }, 300); // Match the CSS transition duration
    });

    map.getViewport().appendChild(expandControl);
}

function copyToClipboard(value) {
    navigator.clipboard.writeText(value);
}

function displayLayerCoordinates(layer) {
    const centerAndZoom = calculateCenterAndZoom(layer);
    const coordsDiv = document.getElementById('layerCoordinates');
    if (!coordsDiv) return;
    const centerStr = `${centerAndZoom.lon.toFixed(6)}, ${centerAndZoom.lat.toFixed(6)}`;
    const zoomStr = `${centerAndZoom.zoom}`;
    coordsDiv.innerHTML = `
        <div>
            <strong>Center:</strong> <span>${centerStr}</span>
            <button class="copy-btn" onclick="copyToClipboard('${centerStr}')" title="Copy center"><i class='fa-solid fa-copy'></i></button>
        </div>
        <div>
            <strong>Zoom:</strong> <span>${zoomStr}</span>
            <button class="copy-btn" onclick="copyToClipboard('${zoomStr}')" title="Copy zoom"><i class='fa-solid fa-copy'></i></button>
        </div>
    `;
    // Get the identifier and generate the XYZ URL
    const identifier = layer.querySelector('Identifier').textContent;
    const id = document.getElementById('id').value.trim();
    const xyzUrl = getXYZUrl(id, identifier);
    // Initialize or update the map
    initMap(centerAndZoom, centerAndZoom.zoom, xyzUrl);
}

function displayXYZTemplate(layer) {
    const identifier = layer.querySelector('Identifier').textContent;
    const id = document.getElementById('id').value.trim();
    const xyzUrl = getXYZUrl(id, identifier);
    const xyzDiv = document.getElementById('xyzTemplate');
    xyzDiv.innerHTML = `<div><strong>XYZ template url:</strong> <span>${xyzUrl}</span><button class="copy-btn" onclick="copyToClipboard('${xyzUrl}')" title="Copy XYZ template"><i class='fa-solid fa-copy'></i></button></div>`;
}

function updateLibraryOptions() {
    const lib = mapLibrarySelect.value;
    let html = '';
    // Layer selector and opacity control for all libraries
    html += `<label><input type="checkbox" id="layerSelector" checked> Layer selector</label> `;
    html += `<label><input type="checkbox" id="opacityControl"> Opacity control</label> `;
    
    if (lib === 'OpenLayers') {
        html += `<label><input type="checkbox" id="olPermalink" checked> Shareable URL</label> `;
        html += `<label><input type="checkbox" id="displayScale"> Scale</label> `;
    } else if (lib === 'MapLibre') {
        html += `<label><input type="checkbox" id="ml3d"> 3D</label>`;
    } else {
        html += '<span style="color:#64748b;">No extra options for Leaflet.</span>';
    }
    libraryOptionsDiv.innerHTML = html;

    // Opacity control logic
    const layerSelector = document.getElementById('layerSelector');
    const opacityControl = document.getElementById('opacityControl');
    function updateOpacityControlState() {
        if (!layerSelector.checked) {
            opacityControl.checked = false;
            opacityControl.disabled = true;
        } else {
            opacityControl.disabled = false;
        }
        updatePrompt();
    }
    layerSelector.addEventListener('change', updateOpacityControlState);
    opacityControl.addEventListener('change', updatePrompt);
    
    // Add change listeners for other checkboxes
    document.getElementById('olPermalink')?.addEventListener('change', updatePrompt);
    document.getElementById('displayScale')?.addEventListener('change', updatePrompt);
    document.getElementById('ml3d')?.addEventListener('change', updatePrompt);
    
    // Set initial state
    updateOpacityControlState();
}

function getPromptText() {
    const lib = mapLibrarySelect.value;
    const base = baseLayerSelect.value;
    const xyz = aiSelectedLayerData.xyz;
    const center = aiSelectedLayerData.center;
    const zoom = aiSelectedLayerData.zoom;
    
    let layerName = '';
    if (layerNameInput && layerNameInput.value) {
        layerName = layerNameInput.value;
    } else if (aiSelectedLayerData.layerName) {
        layerName = aiSelectedLayerData.layerName;
    }
    
    let bullets = [];
    let permalinkText = '';
    const layerSelector = document.getElementById('layerSelector');
    const opacityControl = document.getElementById('opacityControl');
    
    if (lib === 'OpenLayers') {
        if (document.getElementById('olPermalink')?.checked) permalinkText = 'with an auto-updating url hash for the map state';
    } else if (lib === 'MapLibre') {
        if (document.getElementById('ml3d')?.checked) bullets.push('3D support');
    }
    
    if (layerSelector && layerSelector.checked) {
        if (opacityControl && opacityControl.checked) {
            bullets.push('a layer selector that has an opacity slider for the overlay, integrated in the layer selector container');
        } else {
            bullets.push('a layer selector');
        }
    } else {
        bullets.push('no layer selector');
    }
    
    if (document.getElementById('displayScale')?.checked) {
        bullets.push('a scale');
    }
    
    if (permalinkText) {
        bullets.push(permalinkText);
    }
    
    let prompt = `Generate the code for a ${lib} map with an XYZ template of ${xyz} with a layer name of "${layerName}" centered at ${center} at zoom level ${zoom} using ${base} as the base layer.`;
    if (bullets.length) {
        prompt += `\n\nPlease create the application with:\n`;
        prompt += bullets.map(b => `* ${b}`).join('\n');
    }
    
    if (lib === 'OpenLayers') {
        prompt += '\n\nUse https://cdn.jsdelivr.net/npm/ol@v9.2.4/dist/ol.js to use OpenLayers version 9.2.4 for the OpenLayers library.';
        prompt += '\nUse the classic OpenLayers setup with <script src=".../ol.js"> and avoid ES modules or type="module" and avoid ol.control.defaults — explicitly list the controls in an array and don\'t rely on the defaults().extend() pattern.';
        prompt += '\nUse explicit control positioning: zoom in top-left, attribution in bottom-right, custom controls (like layer selectors) in top-right, vertically spaced so they do not overlap with zoom or each other. Use ol-control CSS classes correctly and apply manual spacing as needed.';
        if (document.getElementById('displayScale')?.checked) {
            prompt += '\nUse the ScaleLine control for displaying the map scale.';
        }
    }
    if (lib === 'Leaflet') {
        prompt += '\n\nGive me code with external resources, but leave out all integrity and crossorigin attributes.';
    }
    return prompt;
}

function updatePrompt() {
    aiPromptText.value = getPromptText();
}

mapLibrarySelect.addEventListener('change', () => {
    updateLibraryOptions();
    updatePrompt();
    libraryOptionsDiv.querySelectorAll('input').forEach(input => input.addEventListener('change', updatePrompt));
});
baseLayerSelect.addEventListener('change', updatePrompt);

// Initial setup
updateLibraryOptions();
libraryOptionsDiv.querySelectorAll('input').forEach(input => input.addEventListener('change', updatePrompt));
updatePrompt();

// Copy prompt button logic
document.getElementById('copyPromptBtn').addEventListener('click', function() {
    const prompt = document.getElementById('aiPromptText').value;
    navigator.clipboard.writeText(prompt);
});

// Add event listener for hash changes
window.addEventListener('hashchange', function() {
    // Only re-process if the new hash is different from what selectLayer would set for the current state,
    // or if the ID part is different. This is a simple check and might need refinement.
    // For now, let's keep it simple and always re-evaluate.
    handleHash();
});

// Check URL hash on page load
window.addEventListener('load', function() {
    handleHash();
});

function handleHash() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        const parts = hash.split('/');
        let idFromHash = null;
        let layerTitleFromHash = null;

        if (parts.length >= 2 && parts[0] === 'id') {
            idFromHash = parts[1];
        }
        if (parts.length >= 4 && parts[2] === 'layer') {
            layerTitleFromHash = parts[3]; // Will be decoded in getLayers
        }

        const idInput = document.getElementById('id');
        if (idFromHash && idInput.value !== idFromHash) {
            idInput.value = idFromHash;
            getLayers(idFromHash, layerTitleFromHash);
        } else if (idFromHash && !layerTitleFromHash && idInput.value === idFromHash) {
            // ID is in hash and matches input, but no layer - likely from user typing ID
            // getLayers was already called by oninput, or will be if user just cleared layer from hash.
            // If we need to re-trigger layer selection based on hash without layer, it's complex.
            // For now, assume user interaction or previous getLayers handles it.
        } else if (idFromHash && layerTitleFromHash && idInput.value === idFromHash) {
             // ID in input matches hash, and there's a layer in hash.
             // This case is to ensure layer selection happens if hash was manually changed to add a layer
             // or if initial load had both.
            getLayers(idFromHash, layerTitleFromHash);
        }
    }
}

// Initial setup for existing elements like the ID input
document.getElementById('id').addEventListener('input', function() {
    getLayers(this.value.trim(), null); // Pass null for layerTitleFromHash
});

// Add layer name input change event handler
if (layerNameInput) {
    layerNameInput.addEventListener('input', updatePrompt);
}

// Ensure initial prompt is updated
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the layer name input if needed
    if (layerNameInput && !layerNameInput.value && aiSelectedLayerData.layerName) {
        layerNameInput.value = aiSelectedLayerData.layerName;
    }
    
    // Update the prompt when the page loads
    updatePrompt();
});

function showResolutionError(errorText, zoomLevel) {
    // Parse the error message to extract the requested and limit values
    const requestMatch = errorText.match(/Your request of ([\d.]+) meters per pixel/);
    const limitMatch = errorText.match(/exceeds the limit ([\d.]+) meters per pixel/);
    
    const requestedResolution = requestMatch ? requestMatch[1] : 'unknown';
    const limitResolution = limitMatch ? limitMatch[1] : 'unknown';
    
    // Create or update error message element
    let errorDiv = document.getElementById('resolutionError');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'resolutionError';
        errorDiv.className = 'resolution-error-message';
        document.getElementById('map').appendChild(errorDiv);
    }
    
    errorDiv.innerHTML = `
        <div class="error-content">
            <i class="fa-solid fa-exclamation-triangle"></i>
            <div class="error-text">
                <strong>Zoom in to view layer</strong><br>
                Your request of ${requestedResolution} meters per pixel exceeds the limit of ${limitResolution} meters per pixel. Please zoom in to a higher detail level.
            </div>
            <div class="error-actions">
                <button onclick="zoomInFromError()" class="zoom-in-btn" title="Zoom in one level">
                    <i class="fa-solid fa-magnifying-glass-plus"></i>
                </button>
                <button onclick="hideResolutionError()" class="close-error" title="Close">×</button>
            </div>
        </div>
    `;
    errorDiv.style.display = 'block';
}

function zoomInFromError() {
    if (map) {
        const currentZoom = map.getView().getZoom();
        map.getView().animate({
            zoom: currentZoom + 1,
            duration: 300
        });
    }
}

function hideResolutionError() {
    const errorDiv = document.getElementById('resolutionError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}