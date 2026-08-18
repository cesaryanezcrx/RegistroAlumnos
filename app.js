/**
 * ==========================================================================
 * LÓGICA DEL SISTEMA - ASISTENCIA QR Y LECTOR USB (CBTis 111)
 * Desarrollador Frontend Senior - Código Vanilla ES6+ Limpio y Modular
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    let catalog = [];
    let attendance = {}; // Estructura: { "YYYY-MM-DD": { "ID_ALU": { status: 'present'|'late'|'absent', time: 'HH:MM:SS' } } }
    let lastScans = {};   // Estructura: { "ID_ALU": timestamp_ms } para duplicados (10 min lockout)
    
    // Instancia de html5QrCode
    let html5QrCode = null;
    let scannerActive = false;
    let studentToEditId = null;

    // --- ALUMNOS DE EJEMPLO (PRE-CARGADOS) ---
    const DEFAULT_STUDENTS = [
        { id: 'ALU-2026-001', paternal: 'Yáñez', maternal: 'Cruz', name: 'César' },
        { id: 'ALU-2026-002', paternal: 'Pérez', maternal: 'Gómez', name: 'María José' },
        { id: 'ALU-2026-003', paternal: 'Hernández', maternal: 'Díaz', name: 'Alejandro' },
        { id: 'ALU-2026-004', paternal: 'López', maternal: 'Martínez', name: 'Sofía' },
        { id: 'ALU-2026-005', paternal: 'Rodríguez', maternal: 'Sánchez', name: 'Juan Carlos' },
        { id: 'ALU-2026-006', paternal: 'Ramírez', maternal: 'Torres', name: 'Ana Laura' },
        { id: 'ALU-2026-007', paternal: 'García', maternal: 'Flores', name: 'Luis Ángel' },
        { id: 'ALU-2026-008', paternal: 'Vázquez', maternal: 'Reyes', name: 'Diana Laura' },
        { id: 'ALU-2026-009', paternal: 'Sánchez', maternal: 'Morales', name: 'Roberto' },
        { id: 'ALU-2026-010', paternal: 'Castillo', maternal: 'Ruiz', name: 'Elena' }
    ];

    // --- ELEMENTOS DEL DOM ---
    // Configuración Rápida
    const cfgGroup = document.getElementById('cfg-group');
    const cfgStartTime = document.getElementById('cfg-start-time');
    const cfgTolerance = document.getElementById('cfg-tolerance');
    const currentDateSpan = document.getElementById('current-date-span');

    // Escáner QR
    const scannerContainerCard = document.getElementById('scanner-container-card');
    const scannerBadge = document.getElementById('scanner-badge');
    const cameraSelect = document.getElementById('camera-select');
    const btnToggleScanner = document.getElementById('btn-toggle-scanner');
    const scanOverlay = document.getElementById('scan-overlay');

    // Lector USB
    const usbContainerCard = document.getElementById('usb-container-card');
    const usbFocusBadge = document.getElementById('usb-focus-badge');
    const usbInput = document.getElementById('usb-input');
    const btnManualSubmit = document.getElementById('btn-manual-submit');

    // Último Registro
    const lastResultCard = document.getElementById('last-result-card');
    const resultDisplayArea = document.getElementById('result-display-area');

    // Métricas
    const valTotal = document.getElementById('metric-val-total');
    const valPresent = document.getElementById('metric-val-present');
    const valLate = document.getElementById('metric-val-late');
    const valAbsent = document.getElementById('metric-val-absent');
    const valPercent = document.getElementById('metric-val-percent');

    // Pestañas / Tabs
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    // Pestaña Asistencia
    const searchAttendance = document.getElementById('search-attendance');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnResetAttendance = document.getElementById('btn-reset-attendance');
    const attendanceTableBody = document.getElementById('attendance-table-body');
    const attendanceEmpty = document.getElementById('attendance-empty');

    // Pestaña Catálogo
    const csvFileInput = document.getElementById('csv-file-input');
    const csvDropzone = document.getElementById('csv-dropzone');
    const addStudentForm = document.getElementById('add-student-form');
    const btnRestoreSamples = document.getElementById('btn-restore-samples');
    const btnClearCatalog = document.getElementById('btn-clear-catalog');
    const catalogCountBadge = document.getElementById('catalog-count-badge');
    const searchCatalog = document.getElementById('search-catalog');
    const catalogTableBody = document.getElementById('catalog-table-body');
    const catalogEmpty = document.getElementById('catalog-empty');

    // Modales y Toasts
    const toastContainer = document.getElementById('toast-container');
    const editModal = document.getElementById('edit-modal');
    const modalStudentName = document.getElementById('modal-student-name');
    const modalStudentId = document.getElementById('modal-student-id');
    const modalStatusSelect = document.getElementById('modal-status-select');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');

    // --- INICIALIZACIÓN ---
    function init() {
        // Establecer Fecha Actual en Español
        const today = new Date();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        currentDateSpan.textContent = today.toLocaleDateString('es-MX', options);

        // Cargar Catálogo desde LocalStorage
        const savedCatalog = localStorage.getItem('cbtis_qr_catalog');
        if (savedCatalog) {
            try {
                catalog = JSON.parse(savedCatalog);
            } catch (e) {
                console.error("Error cargando catálogo:", e);
                catalog = [...DEFAULT_STUDENTS];
            }
        } else {
            catalog = [...DEFAULT_STUDENTS];
            saveCatalogToLocalStorage();
        }

        // Cargar Historial de Asistencias
        const savedAttendance = localStorage.getItem('cbtis_qr_attendance');
        if (savedAttendance) {
            try {
                attendance = JSON.parse(savedAttendance);
            } catch (e) {
                console.error("Error cargando asistencias:", e);
                attendance = {};
            }
        }

        // Cargar Configuración
        const savedGroup = localStorage.getItem('cbtis_qr_active_group');
        if (savedGroup) cfgGroup.value = savedGroup;
        const savedStartTime = localStorage.getItem('cbtis_qr_start_time');
        if (savedStartTime) cfgStartTime.value = savedStartTime;
        const savedTolerance = localStorage.getItem('cbtis_qr_tolerance');
        if (savedTolerance) cfgTolerance.value = savedTolerance;

        // Configurar Cámaras
        initCameras();

        // Configurar Escuchas de Eventos
        setupEventListeners();

        // Asegurar Autofocus en Lector USB
        focusUSBInput();

        // Renderizar Tablas y Estadísticas Iniciales
        render();
        
        showToast('¡Sistema Listo!', 'Control de asistencia QR iniciado correctamente.', 'info');
    }

    // --- CONFIGURACIÓN DE CÁMARAS (html5-qrcode) ---
    function initCameras() {
        Html5Qrcode.getCameras().then(devices => {
            cameraSelect.innerHTML = '';
            if (devices && devices.length > 0) {
                devices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.id;
                    option.textContent = device.label || `Cámara ${cameraSelect.childElementCount + 1}`;
                    cameraSelect.appendChild(option);
                });
            } else {
                cameraSelect.innerHTML = '<option value="">No se detectaron cámaras</option>';
            }
        }).catch(err => {
            console.error("Error al obtener cámaras:", err);
            cameraSelect.innerHTML = '<option value="">Permiso de cámara denegado</option>';
        });
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Enfoque constante en Lector USB
        document.body.addEventListener('click', (e) => {
            // No recuperar enfoque si el usuario está interactuando con inputs/selects del dashboard
            const ignoredTags = ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION'];
            if (ignoredTags.includes(e.target.tagName) || e.target.closest('.modal-card')) {
                return;
            }
            focusUSBInput();
        });

        usbInput.addEventListener('focus', () => {
            usbFocusBadge.innerHTML = '<i class="fa-solid fa-circle"></i> Listo';
            usbFocusBadge.className = 'badge badge-success animate-pulse';
            usbContainerCard.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        });

        usbInput.addEventListener('blur', () => {
            // Cambiar color/estado a Sin Foco para advertir al usuario
            usbFocusBadge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Sin Foco';
            usbFocusBadge.className = 'badge badge-warning';
            usbContainerCard.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        });

        usbInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const code = usbInput.value.trim();
                if (code) {
                    processScan(code, 'usb');
                }
                usbInput.value = '';
            }
        });

        btnManualSubmit.addEventListener('click', () => {
            const code = usbInput.value.trim();
            if (code) {
                processScan(code, 'usb');
            }
            usbInput.value = '';
            focusUSBInput();
        });

        // Configuración rápida del Header
        cfgGroup.addEventListener('input', () => {
            localStorage.setItem('cbtis_qr_active_group', cfgGroup.value);
        });
        cfgStartTime.addEventListener('change', () => {
            localStorage.setItem('cbtis_qr_start_time', cfgStartTime.value);
            updateAttendanceStatesBasedOnNewConfig();
            render();
        });
        cfgTolerance.addEventListener('input', () => {
            localStorage.setItem('cbtis_qr_tolerance', cfgTolerance.value);
            updateAttendanceStatesBasedOnNewConfig();
            render();
        });

        // Toggle del Escáner QR
        btnToggleScanner.addEventListener('click', toggleScanner);

        // Control de Pestañas
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => l.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                link.classList.add('active');
                const targetTab = document.getElementById(link.getAttribute('data-tab'));
                if (targetTab) targetTab.classList.add('active');
                
                focusUSBInput();
            });
        });

        // Filtro y Búsqueda en Pase de Lista
        searchAttendance.addEventListener('input', () => renderAttendanceTable());

        // Exportación y Reinicio de Asistencia
        btnExportCsv.addEventListener('click', exportAttendanceToCSV);
        btnResetAttendance.addEventListener('click', resetDailyAttendance);

        // Formulario de Catálogo Manual
        addStudentForm.addEventListener('submit', handleAddStudentSubmit);

        // Subida de Archivo CSV (Catálogo)
        csvFileInput.addEventListener('change', handleCSVUpload);

        // Soporte Drag & Drop para el dropzone del CSV
        ['dragenter', 'dragover'].forEach(eventName => {
            csvDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                csvDropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            csvDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                csvDropzone.classList.remove('dragover');
            }, false);
        });

        csvDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                csvFileInput.files = files;
                handleCSVFile(files[0]);
            }
        });

        csvDropzone.addEventListener('click', () => csvFileInput.click());

        // Búsqueda en Catálogo
        searchCatalog.addEventListener('input', () => renderCatalogTable());

        // Acciones de Zona Peligrosa
        btnRestoreSamples.addEventListener('click', restoreSampleCatalog);
        btnClearCatalog.addEventListener('click', clearEntireCatalog);

        // Eventos del Modal
        modalCloseBtn.addEventListener('click', closeEditModal);
        modalCancelBtn.addEventListener('click', closeEditModal);
        modalSaveBtn.addEventListener('click', saveManualStatusChange);
        window.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
        });
    }

    // --- ENFOQUE DEL LECTOR USB ---
    function focusUSBInput() {
        // Espera un milisegundo para que no interfiera con otros clics legítimos
        setTimeout(() => {
            if (document.activeElement !== usbInput) {
                usbInput.focus();
            }
        }, 150);
    }

    // --- RE-EVALUAR ESTATUS DE ASISTENCIA CUANDO CAMBIAN LOS HORARIOS ---
    function updateAttendanceStatesBasedOnNewConfig() {
        const todayStr = getTodayDateString();
        if (!attendance[todayStr]) return;

        Object.keys(attendance[todayStr]).forEach(studentId => {
            const record = attendance[todayStr][studentId];
            if (record.status !== 'absent') {
                const assigned = evaluateStatus(record.time);
                record.status = assigned;
            }
        });
        saveAttendanceToLocalStorage();
    }

    // --- CONTROL DEL QR SCANNER (INICIAR / DETENER) ---
    function toggleScanner() {
        if (scannerActive) {
            stopScanner();
        } else {
            startScanner();
        }
    }

    function startScanner() {
        const cameraId = cameraSelect.value;
        if (!cameraId) {
            showToast('Cámara No Seleccionada', 'Por favor selecciona un dispositivo de cámara válido.', 'warning');
            return;
        }

        scannerContainerCard.classList.remove('flash-success', 'flash-warning', 'flash-error');
        
        html5QrCode = new Html5Qrcode("reader");
        const config = {
            fps: 15,
            qrbox: (width, height) => {
                const size = Math.min(width, height) * 0.7;
                return { width: size, height: size };
            }
        };

        btnToggleScanner.disabled = true;
        btnToggleScanner.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';

        html5QrCode.start(
            cameraId,
            config,
            (decodedText) => {
                processScan(decodedText, 'camera');
            },
            (errorMessage) => {
                // Errores de análisis silenciosos para mantener limpia la consola
            }
        ).then(() => {
            scannerActive = true;
            btnToggleScanner.disabled = false;
            btnToggleScanner.innerHTML = '<i class="fa-solid fa-stop"></i> Detener Cámara';
            btnToggleScanner.className = 'btn btn-danger btn-sm';
            
            scannerBadge.innerHTML = '<i class="fa-solid fa-circle"></i> Activo';
            scannerBadge.className = 'badge badge-success animate-pulse';
            
            scanOverlay.style.display = 'block';
            showToast('Escáner QR Iniciado', 'Apunta el código QR al visor de la cámara.', 'success');
        }).catch(err => {
            console.error("No se pudo iniciar el escáner QR:", err);
            btnToggleScanner.disabled = false;
            btnToggleScanner.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar Cámara';
            showToast('Error de Cámara', 'No se pudo acceder a la cámara seleccionada.', 'danger');
            stopScanner();
        });
    }

    function stopScanner() {
        scannerBadge.innerHTML = '<i class="fa-solid fa-circle"></i> Inactivo';
        scannerBadge.className = 'badge badge-error';
        
        btnToggleScanner.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar Cámara';
        btnToggleScanner.className = 'btn btn-primary btn-sm';
        scanOverlay.style.display = 'none';

        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode = null;
                scannerActive = false;
            }).catch(err => {
                console.error("Error deteniendo el escáner:", err);
                html5QrCode = null;
                scannerActive = false;
            });
        } else {
            scannerActive = false;
        }
        
        focusUSBInput();
    }

    // --- PROCESAR CÓDIGO ESCANEADO (NÚCLEO DEL NEGOCIO) ---
    function processScan(code, source = 'camera') {
        const studentId = code.trim();
        if (studentId === '') return;

        const targetCard = source === 'camera' ? scannerContainerCard : usbContainerCard;
        
        // 1. Buscar en el catálogo de alumnos
        const student = catalog.find(s => s.id === studentId);
        if (!student) {
            playBeep('error');
            triggerFlashFeedback(targetCard, 'error');
            showToast('ID Desconocido', `El ID "${studentId}" no coincide con ningún alumno registrado.`, 'danger');
            
            updateLastScannedDisplay({
                success: false,
                id: studentId,
                name: 'Alumno No Registrado',
                message: 'No existe en el catálogo'
            });
            return;
        }

        const todayStr = getTodayDateString();
        const now = new Date();
        const currentTimestamp = now.getTime();

        // 2. Inicializar base de asistencias del día si no existe
        if (!attendance[todayStr]) {
            attendance[todayStr] = {};
        }

        // 3. Control de duplicados en menos de 10 minutos (600,000 ms)
        const lastScanTime = lastScans[studentId];
        const alreadyRegisteredToday = attendance[todayStr][studentId] && attendance[todayStr][studentId].status !== 'absent';
        
        if (alreadyRegisteredToday && lastScanTime && (currentTimestamp - lastScanTime < 600000)) {
            const minutesLeft = Math.ceil((600000 - (currentTimestamp - lastScanTime)) / 60000);
            
            playBeep('warning');
            triggerFlashFeedback(targetCard, 'warning');
            showToast('Ya Registrado', `${student.name} ${student.paternal} ya tiene asistencia cargada hoy.`, 'warning');
            
            updateLastScannedDisplay({
                success: true,
                isDuplicate: true,
                id: student.id,
                name: `${student.name} ${student.paternal} ${student.maternal}`,
                time: attendance[todayStr][studentId].time,
                status: attendance[todayStr][studentId].status,
                message: `Escaneo duplicado (bloqueado por ${minutesLeft} min)`
            });
            return;
        }

        // 4. Evaluar estatus dinámicamente según la hora de inicio y tolerancia
        const timeString = now.toLocaleTimeString('es-MX', { hour12: false });
        const status = evaluateStatus(timeString);

        // 5. Guardar Registro
        attendance[todayStr][studentId] = {
            status: status,
            time: timeString
        };
        
        // Registrar timestamp de último escaneo para control de rebotes
        lastScans[studentId] = currentTimestamp;

        // 6. Feedback sensorial completo
        playBeep('success');
        triggerFlashFeedback(targetCard, 'success');
        
        const statusLabel = status === 'present' ? 'ASISTENCIA' : 'RETARDO';
        showToast('Registro Exitoso', `${student.name} ${student.paternal} - ${statusLabel}`, 'success');

        // 7. Actualizar UI
        updateLastScannedDisplay({
            success: true,
            isDuplicate: false,
            id: student.id,
            name: `${student.name} ${student.paternal} ${student.maternal}`,
            time: timeString,
            status: status
        });

        saveAttendanceToLocalStorage();
        render();
    }

    // --- EVALUAR ESTATUS DE LLEGADA ---
    function evaluateStatus(timeString) {
        const startTimeVal = cfgStartTime.value; // Formato "HH:MM"
        const toleranceVal = parseInt(cfgTolerance.value, 10) || 0; // Minutos

        const [currH, currM, currS] = timeString.split(':').map(Number);
        const [startH, startM] = startTimeVal.split(':').map(Number);

        // Convertir todo a minutos transcurridos del día para un cálculo matemático exacto
        const currentMinutes = currH * 60 + currM;
        const startMinutes = startH * 60;
        const limitMinutes = startMinutes + toleranceVal;

        // Si llegó antes o justo dentro del límite de tolerancia, es asistencia
        if (currentMinutes <= limitMinutes) {
            return 'present';
        } else {
            return 'late';
        }
    }

    // --- NOTIFICACIÓN SONORA (Web Audio API) ---
    function playBeep(type) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            if (type === 'success') {
                // Beep corto de tono alto y agradable (Éxito)
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Nota La5 (A5)
                gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.15);
            } else if (type === 'warning') {
                // Dos beeps cortos de tono medio (Duplicado)
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(554, audioCtx.currentTime); // Nota C#5
                gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.22);
            } else if (type === 'error') {
                // Zumbido grave y de advertencia (Error)
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(180, audioCtx.currentTime); 
                gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
                oscillator.start(audioCtx.currentTime);
                oscillator.stop(audioCtx.currentTime + 0.35);
            }
        } catch (e) {
            console.warn("Navegador bloqueó la reproducción automática de audio:", e);
        }
    }

    // --- FEEDBACK VISUAL FLASH ---
    function triggerFlashFeedback(element, type) {
        const className = `flash-${type}`;
        element.classList.remove('flash-success', 'flash-warning', 'flash-error');
        
        // Forzar un reflow para resetear la animación
        void element.offsetWidth;
        
        element.classList.add(className);
    }

    // --- ACTUALIZAR PANTALLA DE ÚLTIMO REGISTRO ---
    function updateLastScannedDisplay(info) {
        resultDisplayArea.innerHTML = '';
        
        if (!info.success) {
            resultDisplayArea.innerHTML = `
                <div class="student-scanned-card status-error">
                    <div class="scanned-title-row">
                        <span class="scanned-name text-danger">${info.name}</span>
                        <span class="scanned-id">ID: ${info.id}</span>
                    </div>
                    <div class="scanned-info-row" style="margin-top: 5px;">
                        <span>Estatus: <strong class="text-danger">DESCONOCIDO</strong></span>
                        <span class="text-danger">${info.message}</span>
                    </div>
                </div>
            `;
            return;
        }

        const isLate = info.status === 'late';
        const statusClass = info.isDuplicate ? 'status-error' : (isLate ? 'status-late' : 'status-present');
        const textClass = info.isDuplicate ? 'text-danger' : (isLate ? 'text-warning' : 'text-success');
        const statusLabel = info.isDuplicate ? 'DUPLICADO' : (isLate ? 'RETARDO' : 'ASISTENCIA');
        
        resultDisplayArea.innerHTML = `
            <div class="student-scanned-card ${statusClass}">
                <div class="scanned-title-row">
                    <span class="scanned-name">${info.name}</span>
                    <span class="scanned-id">${info.id}</span>
                </div>
                <div class="scanned-info-row" style="margin-top: 5px;">
                    <span>Estatus: <strong class="${textClass}">${statusLabel}</strong></span>
                    <span>Hora: <strong class="scanned-time">${info.time || '--:--:--'}</strong></span>
                </div>
                ${info.message ? `<div class="help-text text-warning" style="margin-bottom:0; margin-top:5px; font-weight:600;"><i class="fa-solid fa-lock"></i> ${info.message}</div>` : ''}
            </div>
        `;
    }

    // --- SISTEMA DE RENDERIZADO GLOBAL ---
    function render() {
        renderMetrics();
        renderAttendanceTable();
        renderCatalogTable();
    }

    // --- RENDERIZAR MÉTRICAS DEL DASHBOARD ---
    function renderMetrics() {
        const todayStr = getTodayDateString();
        const dayRecords = attendance[todayStr] || {};

        const totalStudents = catalog.length;
        let present = 0;
        let late = 0;

        // Contar registros que se tengan cargados hoy
        Object.keys(dayRecords).forEach(studentId => {
            // Verificar que siga existiendo en el catálogo actual
            if (catalog.some(s => s.id === studentId)) {
                const record = dayRecords[studentId];
                if (record.status === 'present') present++;
                else if (record.status === 'late') late++;
            }
        });

        const totalAttended = present + late;
        const absent = Math.max(0, totalStudents - totalAttended);
        const percent = totalStudents > 0 ? Math.round((totalAttended / totalStudents) * 100) : 0;

        valTotal.textContent = totalStudents;
        valPresent.textContent = present;
        valLate.textContent = late;
        valAbsent.textContent = absent;
        valPercent.textContent = `${percent}%`;

        // Modificar el estilo del % si es bajo o alto
        const metricPercentCard = document.getElementById('metric-percent');
        if (percent >= 80) {
            metricPercentCard.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else if (percent >= 60) {
            metricPercentCard.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        } else {
            metricPercentCard.style.background = 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)';
        }
    }

    // --- RENDERIZAR TABLA DE ASISTENCIA DEL DÍA ---
    function renderAttendanceTable() {
        const todayStr = getTodayDateString();
        const dayRecords = attendance[todayStr] || {};
        const query = searchAttendance.value.toLowerCase().trim();
        
        attendanceTableBody.innerHTML = '';

        if (catalog.length === 0) {
            attendanceEmpty.style.display = 'flex';
            btnResetAttendance.disabled = true;
            btnExportCsv.disabled = true;
            return;
        }

        // Construir fila para cada alumno del catálogo (Cruzar datos)
        let filteredCount = 0;
        
        catalog.forEach((student, index) => {
            const fullName = `${student.paternal} ${student.maternal} ${student.name}`.toLowerCase();
            const alternateFullName = `${student.name} ${student.paternal} ${student.maternal}`.toLowerCase();
            
            // Buscar por nombre o ID
            if (query !== '' && !fullName.includes(query) && !alternateFullName.includes(query) && !student.id.toLowerCase().includes(query)) {
                return;
            }

            filteredCount++;
            const record = dayRecords[student.id];
            
            // Determinar Estatus
            let status = 'absent';
            let regTime = '--:--:--';
            
            if (record) {
                status = record.status;
                regTime = record.time || '--:--:--';
            }

            const row = document.createElement('tr');
            
            let badgeClass = 'status-falta';
            let badgeText = 'Falta';
            if (status === 'present') {
                badgeClass = 'status-presente';
                badgeText = 'Asistencia';
            } else if (status === 'late') {
                badgeClass = 'status-retardo';
                badgeText = 'Retardo';
            }

            row.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td><strong>${student.id}</strong></td>
                <td>${student.paternal} ${student.maternal}, ${student.name}</td>
                <td style="text-align: center;">
                    <span class="status-pill ${badgeClass}">${badgeText}</span>
                </td>
                <td style="text-align: center; font-family: monospace; font-weight: 600;">${regTime}</td>
                <td style="text-align: center;">
                    <div class="row-actions">
                        <button class="btn-row-action btn-row-edit" onclick="openManualEdit('${student.id}')" title="Editar Estatus">
                            <i class="fa-solid fa-user-pen"></i>
                        </button>
                        ${status !== 'absent' ? `
                            <button class="btn-row-action btn-row-delete" onclick="removeRegistration('${student.id}')" title="Eliminar Asistencia">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : `
                            <button class="btn-row-action" style="opacity:0.25; cursor:not-allowed;" disabled>
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        `}
                    </div>
                </td>
            `;

            attendanceTableBody.appendChild(row);
        });

        if (filteredCount === 0) {
            attendanceEmpty.style.display = 'flex';
        } else {
            attendanceEmpty.style.display = 'none';
        }

        btnResetAttendance.disabled = false;
        btnExportCsv.disabled = false;
    }

    // --- RENDERIZAR TABLA DE CATÁLOGO ---
    function renderCatalogTable() {
        const query = searchCatalog.value.toLowerCase().trim();
        catalogTableBody.innerHTML = '';
        
        catalogCountBadge.textContent = catalog.length;

        if (catalog.length === 0) {
            catalogEmpty.style.display = 'flex';
            return;
        }

        let filteredCount = 0;

        catalog.forEach(student => {
            const fullName = `${student.paternal} ${student.maternal} ${student.name}`.toLowerCase();
            const alternateFullName = `${student.name} ${student.paternal} ${student.maternal}`.toLowerCase();

            if (query !== '' && !fullName.includes(query) && !alternateFullName.includes(query) && !student.id.toLowerCase().includes(query)) {
                return;
            }

            filteredCount++;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${student.id}</strong></td>
                <td>${student.paternal} ${student.maternal}, ${student.name}</td>
                <td style="text-align: center;">
                    <button class="btn-row-action btn-row-delete" onclick="deleteCatalogStudent('${student.id}')" title="Eliminar Alumno del Catálogo">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            catalogTableBody.appendChild(row);
        });

        if (filteredCount === 0) {
            catalogEmpty.style.display = 'flex';
        } else {
            catalogEmpty.style.display = 'none';
        }
    }

    // --- MANUAL EDIT STATUS MODAL ---
    window.openManualEdit = function(studentId) {
        const student = catalog.find(s => s.id === studentId);
        if (!student) return;

        studentToEditId = studentId;
        modalStudentName.textContent = `${student.name} ${student.paternal} ${student.maternal}`;
        modalStudentId.textContent = student.id;

        const todayStr = getTodayDateString();
        const record = attendance[todayStr] ? attendance[todayStr][studentId] : null;
        
        if (record) {
            modalStatusSelect.value = record.status;
        } else {
            modalStatusSelect.value = 'absent';
        }

        editModal.classList.add('active');
        editModal.setAttribute('aria-hidden', 'false');
    };

    function closeEditModal() {
        editModal.classList.remove('active');
        editModal.setAttribute('aria-hidden', 'true');
        studentToEditId = null;
        focusUSBInput();
    }

    function saveManualStatusChange() {
        if (!studentToEditId) return;

        const todayStr = getTodayDateString();
        const selectedStatus = modalStatusSelect.value;
        
        if (!attendance[todayStr]) {
            attendance[todayStr] = {};
        }

        if (selectedStatus === 'absent') {
            // Eliminar registro del día para regresarlo a ausente
            delete attendance[todayStr][studentToEditId];
            delete lastScans[studentToEditId];
        } else {
            // Asignar estatus manualmente con hora actual si es nuevo, o mantener hora anterior
            const existingTime = attendance[todayStr][studentToEditId] ? attendance[todayStr][studentToEditId].time : null;
            const timeString = existingTime || new Date().toLocaleTimeString('es-MX', { hour12: false });
            
            attendance[todayStr][studentToEditId] = {
                status: selectedStatus,
                time: timeString
            };
            lastScans[studentToEditId] = Date.now();
        }

        saveAttendanceToLocalStorage();
        render();
        closeEditModal();
        showToast('Asistencia Modificada', 'El estatus del alumno ha sido actualizado manualmente.', 'success');
    }

    window.removeRegistration = function(studentId) {
        const todayStr = getTodayDateString();
        if (attendance[todayStr] && attendance[todayStr][studentId]) {
            const student = catalog.find(s => s.id === studentId);
            const studentName = student ? student.name : 'El alumno';
            
            delete attendance[todayStr][studentId];
            delete lastScans[studentId];
            
            saveAttendanceToLocalStorage();
            render();
            showToast('Asistencia Eliminada', `Se removió el registro de asistencia de ${studentName}.`, 'info');
        }
        focusUSBInput();
    };

    // --- ELIMINAR ESTUDIANTE DEL CATÁLOGO ---
    window.deleteCatalogStudent = function(studentId) {
        const student = catalog.find(s => s.id === studentId);
        const studentName = student ? `${student.name} ${student.paternal}` : 'El alumno';
        
        if (confirm(`¿Estás seguro de que deseas eliminar a "${studentName}" del catálogo? Esto también eliminará su asistencia del día.`)) {
            catalog = catalog.filter(s => s.id !== studentId);
            
            const todayStr = getTodayDateString();
            if (attendance[todayStr]) {
                delete attendance[todayStr][studentId];
                delete lastScans[studentId];
            }

            saveCatalogToLocalStorage();
            saveAttendanceToLocalStorage();
            render();
            showToast('Catálogo Actualizado', `Se eliminó a ${studentName} correctamente.`, 'success');
        }
        focusUSBInput();
    };

    // --- AGREGAR ALUMNO MANUALMENTE AL CATÁLOGO ---
    function handleAddStudentSubmit(e) {
        e.preventDefault();
        
        const id = document.getElementById('stu-id').value.trim().toUpperCase();
        const paternal = capitalizeText(document.getElementById('stu-paternal').value.trim());
        const maternal = capitalizeText(document.getElementById('stu-maternal').value.trim());
        const name = capitalizeText(document.getElementById('stu-name').value.trim());

        // Validar duplicados de matrícula en el catálogo
        if (catalog.some(s => s.id === id)) {
            showToast('ID Duplicado', `La matrícula "${id}" ya se encuentra registrada en el catálogo.`, 'warning');
            return;
        }

        const newStudent = { id, paternal, maternal, name };
        catalog.push(newStudent);
        
        // Ordenar alfabéticamente por apellido paterno -> materno -> nombre
        sortCatalog();
        
        saveCatalogToLocalStorage();
        render();
        addStudentForm.reset();
        
        showToast('Alumno Agregado', `${name} ${paternal} fue registrado en el catálogo.`, 'success');
        focusUSBInput();
    }

    // --- CARGA DE ARCHIVOS CSV PARA EL CATÁLOGO ---
    function handleCSVUpload(e) {
        const file = e.target.files[0];
        if (file) handleCSVFile(file);
    }

    function handleCSVFile(file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const text = evt.target.result;
            const parsed = parseCSV(text);
            
            if (parsed.length === 0) {
                showToast('Error de Carga', 'No se detectaron alumnos válidos en el archivo CSV. Revisa el formato.', 'danger');
                return;
            }

            // Preguntar si desea fusionar o sobrescribir el catálogo
            if (catalog.length > 0) {
                if (confirm(`Se detectaron ${parsed.length} alumnos en el CSV. ¿Deseas FUSIONAR los alumnos con el catálogo actual? (Pulsa Cancelar para SOBRESCRIBIR todo el catálogo).`)) {
                    // Fusionar omitiendo duplicados de ID
                    let addedCount = 0;
                    parsed.forEach(student => {
                        if (!catalog.some(s => s.id === student.id)) {
                            catalog.push(student);
                            addedCount++;
                        }
                    });
                    sortCatalog();
                    showToast('Catálogo Fusionado', `Se agregaron ${addedCount} alumnos nuevos.`, 'success');
                } else {
                    // Sobrescribir
                    catalog = parsed;
                    showToast('Catálogo Cargado', `Se importaron ${catalog.length} alumnos del archivo CSV.`, 'success');
                }
            } else {
                catalog = parsed;
                showToast('Catálogo Cargado', `Se cargaron ${catalog.length} alumnos desde el archivo CSV.`, 'success');
            }

            saveCatalogToLocalStorage();
            render();
            csvFileInput.value = '';
        };
        reader.onerror = function() {
            showToast('Error de Lectura', 'No se pudo leer el archivo seleccionado.', 'danger');
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseCSV(text) {
        // Soporta saltos de línea tanto de Windows (\r\n) como de Mac/Linux (\n)
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return [];

        let parsed = [];
        let hasHeader = false;

        // Detectar si la primera fila es cabecera
        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('id') || firstLine.includes('matricula') || firstLine.includes('nombre') || firstLine.includes('apellido')) {
            hasHeader = true;
        }

        const startIndex = hasHeader ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const columns = splitCSVLine(lines[i]);
            if (columns.length < 4) continue;

            const id = columns[0].trim().toUpperCase();
            const paternal = capitalizeText(columns[1].trim());
            const maternal = capitalizeText(columns[2].trim());
            const name = capitalizeText(columns[3].trim());

            if (id && name) {
                parsed.push({ id, paternal, maternal, name });
            }
        }

        return parsed;
    }

    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
            } else if ((char === ',' || char === ';') && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    // --- ACCIONES DE RESTAURACIÓN / LIMPIEZA DE CATÁLOGO ---
    function restoreSampleCatalog() {
        if (confirm('¿Deseas restaurar los alumnos de ejemplo en el catálogo? Esto fusionará o sobrescribirá tus datos actuales.')) {
            catalog = [...DEFAULT_STUDENTS];
            saveCatalogToLocalStorage();
            render();
            showToast('Catálogo Restaurado', 'Se cargaron los 10 alumnos de ejemplo.', 'success');
        }
        focusUSBInput();
    }

    function clearEntireCatalog() {
        if (confirm('¡ADVERTENCIA CRÍTICA! ¿Estás seguro de que deseas eliminar TODOS los alumnos del catálogo y borrar todos los registros de asistencia? Esta acción no se puede deshacer.')) {
            catalog = [];
            attendance = {};
            lastScans = {};
            saveCatalogToLocalStorage();
            saveAttendanceToLocalStorage();
            render();
            
            // Vaciar pantalla de último resultado
            resultDisplayArea.innerHTML = `
                <div class="result-placeholder">
                    <i class="fa-solid fa-barcode-read animate-bounce"></i>
                    <p>Esperando escaneo QR o entrada...</p>
                </div>
            `;
            
            showToast('Base de Datos Vacía', 'Se borraron todos los registros del catálogo y asistencia.', 'info');
        }
        focusUSBInput();
    }

    // --- REINICIAR ASISTENCIA DEL DÍA ---
    function resetDailyAttendance() {
        if (confirm('¿Deseas reiniciar toda la lista de asistencia del día de hoy? Todos los alumnos volverán al estatus de "Falta".')) {
            const todayStr = getTodayDateString();
            attendance[todayStr] = {};
            lastScans = {};
            
            saveAttendanceToLocalStorage();
            render();
            
            resultDisplayArea.innerHTML = `
                <div class="result-placeholder">
                    <i class="fa-solid fa-barcode-read animate-bounce"></i>
                    <p>Esperando escaneo QR o entrada...</p>
                </div>
            `;
            
            showToast('Asistencia Reiniciada', 'Todos los alumnos fueron marcados con Falta.', 'info');
        }
        focusUSBInput();
    }

    // --- EXPORTAR INFORME DE ASISTENCIA A CSV ---
    function exportAttendanceToCSV() {
        if (catalog.length === 0) {
            showToast('Exportación Vacía', 'No hay alumnos en el catálogo para exportar un reporte.', 'warning');
            return;
        }

        const todayStr = getTodayDateString();
        const dayRecords = attendance[todayStr] || {};
        const group = cfgGroup.value.trim().toUpperCase() || 'S_G';
        const startTime = cfgStartTime.value;
        const tolerance = cfgTolerance.value;

        // Nombre de archivo sanitizado
        const safeGroup = group.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `Asistencia_CBTis111_${safeGroup}_${todayStr}.csv`;

        // Cabecera informativa del archivo CSV (UTF-8)
        let csvContent = `Reporte de Asistencia - CBTis 111\n`;
        csvContent += `Grupo Escolar: ${group}\n`;
        csvContent += `Fecha del Reporte: ${todayStr}\n`;
        csvContent += `Hora Inicio Programada: ${startTime} (Tolerancia: ${tolerance} min)\n\n`;
        csvContent += `No.,Matricula,Apellido Paterno,Apellido Materno,Nombre(s),Estatus,Hora Registro\n`;

        catalog.forEach((student, index) => {
            const record = dayRecords[student.id];
            let statusLabel = 'FALTA';
            let timeLabel = '';

            if (record) {
                if (record.status === 'present') statusLabel = 'ASISTENCIA';
                else if (record.status === 'late') statusLabel = 'RETARDO';
                timeLabel = record.time;
            }

            // Escapar y armar fila CSV
            const id = escapeCSVField(student.id);
            const paternal = escapeCSVField(student.paternal);
            const maternal = escapeCSVField(student.maternal);
            const name = escapeCSVField(student.name);
            
            csvContent += `${index + 1},${id},${paternal},${maternal},${name},${statusLabel},${timeLabel}\n`;
        });

        // Generar descarga con BOM de UTF-8 para Excel
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Reporte Descargado', 'El archivo CSV de asistencia ha sido descargado correctamente.', 'success');
        focusUSBInput();
    }

    // --- AYUDANTES / UTILITIES ---
    
    function getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function capitalizeText(str) {
        if (!str) return '';
        return str
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    function sortCatalog() {
        catalog.sort((a, b) => {
            let cmp = a.paternal.localeCompare(b.paternal, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            cmp = a.maternal.localeCompare(b.maternal, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        });
    }

    function escapeCSVField(val) {
        let strVal = val ? val.toString() : '';
        if (strVal.includes('"')) {
            strVal = strVal.replace(/"/g, '""');
        }
        if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') || strVal.includes(';')) {
            strVal = `"${strVal}"`;
        }
        return strVal;
    }

    function saveCatalogToLocalStorage() {
        localStorage.setItem('cbtis_qr_catalog', JSON.stringify(catalog));
    }

    function saveAttendanceToLocalStorage() {
        localStorage.setItem('cbtis_qr_attendance', JSON.stringify(attendance));
    }

    // --- SISTEMA DE TOASTS CUSTOM ---
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Iconos según estatus
        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'warning') iconClass = 'fa-solid fa-circle-exclamation';
        if (type === 'danger') iconClass = 'fa-solid fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <div class="toast-content">
                <h4 class="toast-title">${title}</h4>
                <p class="toast-message">${message}</p>
            </div>
            <button class="toast-close" aria-label="Cerrar notificación">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            dismissToast(toast);
        });

        toastContainer.appendChild(toast);

        // Auto descarte en 4 segundos
        setTimeout(() => {
            dismissToast(toast);
        }, 4000);
    }

    function dismissToast(toast) {
        if (!toast.parentNode) return;
        toast.style.animation = 'toastOut 0.25s ease-out forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toastContainer.removeChild(toast);
            }
        }, 250);
    }

    // --- EJECUTAR SISTEMA ---
    init();
});
