class WorkflowEditor {
    constructor() {
        this.canvas = document.getElementById('workflow-canvas');
        this.svg = document.querySelector('.connections-layer');
        this.nodes = new Map();
        this.connections = [];
        this.dragState = null;
        this.connectionState = null;
        this.selectedNode = null;
        this.nodeCounter = 0;
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        
        this.init();
        this.loadSampleWorkflow();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupCanvasInteractions();
    }

    setupEventListeners() {
        // Toolbar controls
        document.querySelector('.zoom-in').addEventListener('click', () => this.zoomIn());
        document.querySelector('.zoom-out').addEventListener('click', () => this.zoomOut());
        document.querySelector('.zoom-reset').addEventListener('click', () => this.resetZoom());
        document.querySelector('.zoom-fit').addEventListener('click', () => this.fitToScreen());

        // Run button
        document.querySelector('.run-btn').addEventListener('click', () => this.runWorkflow());
    }

    setupDragAndDrop() {
        const nodeItems = document.querySelectorAll('.node-item');
        
        nodeItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.type);
            });
        });

        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const nodeType = e.dataTransfer.getData('text/plain');
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            this.createNode(nodeType, x, y);
        });
    }

    setupCanvasInteractions() {
        this.canvas.addEventListener('click', (e) => {
            if (e.target === this.canvas) {
                this.deselectAll();
            }
        });

        // Handle mouse wheel for zooming
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= delta;
            this.zoom = Math.max(0.1, Math.min(3, this.zoom));
            this.updateCanvasTransform();
        });
    }

    createNode(type, x, y, config = {}) {
        const nodeId = `node-${++this.nodeCounter}`;
        const nodeData = this.getNodeTemplate(type, config);
        
        const nodeElement = document.createElement('div');
        nodeElement.className = `workflow-node ${type}-node`;
        nodeElement.dataset.nodeId = nodeId;
        nodeElement.style.left = `${x}px`;
        nodeElement.style.top = `${y}px`;
        
        nodeElement.innerHTML = `
            <div class="node-header">
                <span class="node-icon">${nodeData.icon}</span>
                <span class="node-title">${nodeData.title}</span>
            </div>
            <div class="node-body">
                ${nodeData.fields.map(field => `
                    <div class="node-field">
                        <label>${field.label}</label>
                        <input type="${field.type}" value="${field.value}" placeholder="${field.placeholder || ''}">
                    </div>
                `).join('')}
            </div>
        `;

        // Add connection points
        if (nodeData.inputs > 0) {
            const inputPoint = document.createElement('div');
            inputPoint.className = 'connection-point input';
            inputPoint.style.top = '20px';
            nodeElement.appendChild(inputPoint);
            this.setupConnectionPoint(inputPoint, 'input', nodeId);
        }

        if (nodeData.outputs > 0) {
            const outputPoint = document.createElement('div');
            outputPoint.className = 'connection-point output';
            outputPoint.style.top = '20px';
            nodeElement.appendChild(outputPoint);
            this.setupConnectionPoint(outputPoint, 'output', nodeId);
        }

        this.setupNodeInteractions(nodeElement, nodeId);
        this.canvas.appendChild(nodeElement);
        
        this.nodes.set(nodeId, {
            element: nodeElement,
            type: type,
            data: nodeData,
            x: x,
            y: y
        });

        return nodeId;
    }

    getNodeTemplate(type, config) {
        const templates = {
            variable: {
                icon: 'V',
                title: config.title || 'Variable',
                inputs: 0,
                outputs: 1,
                fields: [
                    { label: 'Name', type: 'text', value: config.name || 'category' }
                ]
            },
            function: {
                icon: 'f',
                title: config.title || 'get_doc',
                inputs: 1,
                outputs: 1,
                fields: [
                    { label: 'Function', type: 'text', value: config.function || 'get_doc' }
                ]
            },
            'llm-function': {
                icon: '⚡',
                title: config.title || 'parse_bank_statement',
                inputs: 1,
                outputs: 1,
                fields: [
                    { label: 'Request', type: 'text', value: config.request || 'request' },
                    { label: 'Content', type: 'text', value: config.content || 'content' }
                ]
            },
            foreach: {
                icon: '↻',
                title: config.title || 'foreach_parse_bank_statements',
                inputs: 1,
                outputs: 1,
                fields: [
                    { label: 'Item', type: 'text', value: config.item || 'Item' },
                    { label: 'Name', type: 'text', value: config.name || 'name' }
                ]
            },
            tool: {
                icon: '🔧',
                title: config.title || 'read_doc',
                inputs: 1,
                outputs: 1,
                fields: [
                    { label: 'Tool', type: 'text', value: config.tool || 'read_doc' }
                ]
            },
            llm: {
                icon: '🤖',
                title: config.title || 'get_latest_bank_state',
                inputs: 1,
                outputs: 1,
                fields: [
                    { label: 'Request', type: 'text', value: config.request || 'request' }
                ]
            },
            condition: {
                icon: '?',
                title: config.title || 'Condition',
                inputs: 1,
                outputs: 2,
                fields: [
                    { label: 'Condition', type: 'text', value: config.condition || 'condition' }
                ]
            }
        };

        return templates[type] || templates.function;
    }

    setupNodeInteractions(nodeElement, nodeId) {
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        nodeElement.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('connection-point')) return;
            
            isDragging = true;
            nodeElement.classList.add('dragging');
            this.selectNode(nodeId);
            
            const rect = nodeElement.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const canvasRect = this.canvas.getBoundingClientRect();
            const x = e.clientX - canvasRect.left - dragOffset.x;
            const y = e.clientY - canvasRect.top - dragOffset.y;

            nodeElement.style.left = `${x}px`;
            nodeElement.style.top = `${y}px`;

            const nodeData = this.nodes.get(nodeId);
            nodeData.x = x;
            nodeData.y = y;

            this.updateConnections();
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                nodeElement.classList.remove('dragging');
            }
        });
    }

    setupConnectionPoint(point, type, nodeId) {
        point.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            
            if (type === 'output') {
                this.startConnection(nodeId, point);
            }
        });

        point.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            
            if (this.connectionState && type === 'input') {
                this.completeConnection(nodeId);
            }
        });
    }

    startConnection(fromNodeId, fromPoint) {
        this.connectionState = {
            fromNode: fromNodeId,
            fromPoint: fromPoint,
            tempLine: null
        };

        document.addEventListener('mousemove', this.handleConnectionDrag.bind(this));
        document.addEventListener('mouseup', this.cancelConnection.bind(this));
    }

    handleConnectionDrag(e) {
        if (!this.connectionState) return;

        const canvasRect = this.canvas.getBoundingClientRect();
        const fromRect = this.connectionState.fromPoint.getBoundingClientRect();
        
        const fromX = fromRect.left + fromRect.width / 2 - canvasRect.left;
        const fromY = fromRect.top + fromRect.height / 2 - canvasRect.top;
        const toX = e.clientX - canvasRect.left;
        const toY = e.clientY - canvasRect.top;

        if (this.connectionState.tempLine) {
            this.connectionState.tempLine.remove();
        }

        this.connectionState.tempLine = this.createConnectionLine(fromX, fromY, toX, toY, true);
    }

    completeConnection(toNodeId) {
        if (!this.connectionState) return;

        const connection = {
            from: this.connectionState.fromNode,
            to: toNodeId,
            id: `conn-${this.connections.length}`
        };

        this.connections.push(connection);
        this.updateConnections();
        this.cancelConnection();
    }

    cancelConnection() {
        if (this.connectionState?.tempLine) {
            this.connectionState.tempLine.remove();
        }
        this.connectionState = null;
        
        document.removeEventListener('mousemove', this.handleConnectionDrag.bind(this));
        document.removeEventListener('mouseup', this.cancelConnection.bind(this));
    }

    createConnectionLine(x1, y1, x2, y2, isTemp = false) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const dx = x2 - x1;
        const dy = y2 - y1;
        const curve = Math.abs(dx) * 0.3;
        
        const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
        
        line.setAttribute('d', path);
        line.className = `connection-line ${isTemp ? 'temp' : ''}`;
        
        this.svg.appendChild(line);
        return line;
    }

    updateConnections() {
        // Clear existing connection lines (except temp)
        this.svg.querySelectorAll('.connection-line:not(.temp)').forEach(line => line.remove());

        this.connections.forEach(conn => {
            const fromNode = this.nodes.get(conn.from);
            const toNode = this.nodes.get(conn.to);
            
            if (!fromNode || !toNode) return;

            const fromPoint = fromNode.element.querySelector('.connection-point.output');
            const toPoint = toNode.element.querySelector('.connection-point.input');
            
            if (!fromPoint || !toPoint) return;

            const fromRect = fromPoint.getBoundingClientRect();
            const toRect = toPoint.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            const fromX = fromRect.left + fromRect.width / 2 - canvasRect.left;
            const fromY = fromRect.top + fromRect.height / 2 - canvasRect.top;
            const toX = toRect.left + toRect.width / 2 - canvasRect.left;
            const toY = toRect.top + toRect.height / 2 - canvasRect.top;

            this.createConnectionLine(fromX, fromY, toX, toY);
        });
    }

    selectNode(nodeId) {
        this.deselectAll();
        const node = this.nodes.get(nodeId);
        if (node) {
            node.element.classList.add('selected');
            this.selectedNode = nodeId;
        }
    }

    deselectAll() {
        this.nodes.forEach(node => {
            node.element.classList.remove('selected');
        });
        this.selectedNode = null;
    }

    zoomIn() {
        this.zoom *= 1.2;
        this.zoom = Math.min(3, this.zoom);
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }

    zoomOut() {
        this.zoom /= 1.2;
        this.zoom = Math.max(0.1, this.zoom);
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }

    resetZoom() {
        this.zoom = 1;
        this.pan = { x: 0, y: 0 };
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }

    fitToScreen() {
        // Calculate bounding box of all nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        this.nodes.forEach(node => {
            const rect = node.element.getBoundingClientRect();
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x + rect.width);
            maxY = Math.max(maxY, node.y + rect.height);
        });

        if (this.nodes.size === 0) return;

        const canvasRect = this.canvas.getBoundingClientRect();
        const padding = 50;
        
        const contentWidth = maxX - minX + padding * 2;
        const contentHeight = maxY - minY + padding * 2;
        
        const scaleX = canvasRect.width / contentWidth;
        const scaleY = canvasRect.height / contentHeight;
        
        this.zoom = Math.min(scaleX, scaleY, 1);
        this.pan.x = (canvasRect.width - contentWidth * this.zoom) / 2 - minX * this.zoom + padding * this.zoom;
        this.pan.y = (canvasRect.height - contentHeight * this.zoom) / 2 - minY * this.zoom + padding * this.zoom;
        
        this.updateCanvasTransform();
        this.updateZoomDisplay();
    }

    updateCanvasTransform() {
        this.canvas.style.transform = `scale(${this.zoom}) translate(${this.pan.x / this.zoom}px, ${this.pan.y / this.zoom}px)`;
        this.svg.style.transform = `scale(${this.zoom}) translate(${this.pan.x / this.zoom}px, ${this.pan.y / this.zoom}px)`;
    }

    updateZoomDisplay() {
        const zoomBtn = document.querySelector('.zoom-btn');
        zoomBtn.textContent = `🔍 ${Math.round(this.zoom * 100)}%`;
    }

    runWorkflow() {
        const runBtn = document.querySelector('.run-btn');
        const originalText = runBtn.textContent;
        
        runBtn.textContent = '⏳ Running...';
        runBtn.disabled = true;
        
        // Simulate workflow execution
        setTimeout(() => {
            runBtn.textContent = '✅ Complete';
            setTimeout(() => {
                runBtn.textContent = originalText;
                runBtn.disabled = false;
            }, 2000);
        }, 3000);
    }

    loadSampleWorkflow() {
        // Create sample nodes to match the design
        const nodes = [
            { type: 'function', x: 50, y: 100, config: { title: 'get_doc' } },
            { type: 'foreach', x: 300, y: 50, config: { title: 'foreach_parse_bank_statements' } },
            { type: 'tool', x: 300, y: 150, config: { title: 'Item' } },
            { type: 'function', x: 450, y: 150, config: { title: 'read_doc' } },
            { type: 'llm-function', x: 600, y: 100, config: { title: 'parse_bank_statement' } },
            { type: 'foreach', x: 750, y: 100, config: { title: 'Output' } },
            { type: 'llm', x: 900, y: 50, config: { title: 'get_latest_bank_state' } },
            { type: 'function', x: 1100, y: 50, config: { title: 'update_assets' } }
        ];

        const nodeIds = [];
        nodes.forEach((nodeConfig, index) => {
            const nodeId = this.createNode(nodeConfig.type, nodeConfig.x, nodeConfig.y, nodeConfig.config);
            nodeIds.push(nodeId);
        });

        // Create sample connections
        setTimeout(() => {
            const connections = [
                [0, 1], // get_doc -> foreach_parse_bank_statements
                [1, 2], // foreach -> Item
                [2, 3], // Item -> read_doc
                [3, 4], // read_doc -> parse_bank_statement
                [4, 5], // parse_bank_statement -> Output
                [5, 6], // Output -> get_latest_bank_state
                [6, 7]  // get_latest_bank_state -> update_assets
            ];

            connections.forEach(([fromIndex, toIndex]) => {
                if (nodeIds[fromIndex] && nodeIds[toIndex]) {
                    this.connections.push({
                        from: nodeIds[fromIndex],
                        to: nodeIds[toIndex],
                        id: `conn-${this.connections.length}`
                    });
                }
            });

            this.updateConnections();
        }, 100);
    }
}

// Initialize the workflow editor when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new WorkflowEditor();
});