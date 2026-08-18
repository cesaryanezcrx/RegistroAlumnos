/**
 * ==========================================================================
 * LÓGICA DE NEGOCIO - REGISTRO DE ALUMNOS (CBTis)
 * Características: LocalStorage persistent, exportación CSV UTF-8 BOM,
 * notificaciones Toast custom, modals premium y búsqueda interactiva.
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DE LA APLICACIÓN ---
    let students = [];
    let currentFilter = '';
    let studentToEditId = null;
    let studentToDeleteId = null;

    // --- ESTADO DE ASISTENCIA ---
    let attendanceStudents = [];
    let attendanceHistory = {};
    let attendanceFilter = '';

    // --- ELEMENTOS DEL DOM ---
    // Formulario de Registro
    const registrationForm = document.getElementById('registration-form');
    const groupInput = document.getElementById('group-input');
    const paternalInput = document.getElementById('paternal-last-name');
    const maternalInput = document.getElementById('maternal-last-name');
    const firstNameInput = document.getElementById('first-name');
    const emailInput = document.getElementById('email-input');
    const submitBtn = document.getElementById('btn-submit');

    // Tabla y Buscador
    const studentsTable = document.getElementById('students-table');
    const studentsTableBody = document.getElementById('students-table-body');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const exportCsvBtn = document.getElementById('btn-export-csv');

    // Vistas Vacías
    const emptyStateView = document.getElementById('empty-state-view');
    const noResultsView = document.getElementById('no-results-view');

    // Estadísticas e Info
    const totalCountSpan = document.getElementById('total-count');
    const currentDateSpan = document.getElementById('current-date');

    // Elementos de la Pestaña Asistencia
    const tabButtons = document.querySelectorAll('.tab-btn');
    const viewRegistro = document.getElementById('view-registro');
    const viewAsistencia = document.getElementById('view-asistencia');
    
    const attDateInput = document.getElementById('attendance-date');
    const btnImportFromRegistry = document.getElementById('btn-import-from-registry');
    const csvFileInput = document.getElementById('csv-file-input');
    const btnUploadCsvTrigger = document.getElementById('btn-upload-csv-trigger');
    const btnExportHistory = document.getElementById('btn-export-history');
    const btnImportHistoryTrigger = document.getElementById('btn-import-history-trigger');
    const importHistoryFile = document.getElementById('import-history-file');
    
    const attSearchInput = document.getElementById('attendance-search-input');
    const attClearSearchBtn = document.getElementById('attendance-clear-search');
    const attTable = document.getElementById('attendance-table');
    const attTableBody = document.getElementById('attendance-table-body');
    const attEmptyState = document.getElementById('attendance-empty-state-view');
    const attNoResults = document.getElementById('attendance-no-results-view');
    
    const attStatTotal = document.getElementById('att-stat-total');
    const attStatPresent = document.getElementById('att-stat-present');
    const attStatAbsent = document.getElementById('att-stat-absent');
    const attStatPercent = document.getElementById('att-stat-percent');

    // Contenedores Toast
    const toastContainer = document.getElementById('toast-container');

    // Modales Personalizados
    const editModal = document.getElementById('custom-modal');
    const editModalBody = document.getElementById('modal-body-content');
    const editModalCloseBtn = document.getElementById('modal-close-btn');
    const editModalCancelBtn = document.getElementById('modal-cancel-btn');
    const editModalConfirmBtn = document.getElementById('modal-confirm-btn');

    const deleteModal = document.getElementById('confirm-delete-modal');
    const deleteStudentNameSpan = document.getElementById('delete-student-name');
    const deleteModalCloseBtn = document.getElementById('delete-modal-close-btn');
    const deleteModalCancelBtn = document.getElementById('delete-modal-cancel-btn');
    const deleteModalConfirmBtn = document.getElementById('delete-modal-confirm-btn');

    // Botón Limpiar y su Modal
    const btnClearTable = document.getElementById('btn-clear-table');
    const confirmClearModal = document.getElementById('confirm-clear-modal');
    const clearModalCloseBtn = document.getElementById('clear-modal-close-btn');
    const clearModalCancelBtn = document.getElementById('clear-modal-cancel-btn');
    const clearModalConfirmBtn = document.getElementById('clear-modal-confirm-btn');

    // Modal de Código QR
    let currentQRStudent = null;
    const qrModal = document.getElementById('qr-modal');
    const qrStudentName = document.getElementById('qr-student-name');
    const qrStudentGroup = document.getElementById('qr-student-group');
    const qrStudentEmail = document.getElementById('qr-student-email');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrModalCloseBtn = document.getElementById('qr-modal-close-btn');
    const qrModalDownloadBtn = document.getElementById('qr-modal-download-btn');
    const qrModalPrintBtn = document.getElementById('qr-modal-print-btn');


    // --- INICIALIZACIÓN ---
    function init() {
        // Cargar datos desde LocalStorage
        const savedStudents = localStorage.getItem('cbtis_students');
        if (savedStudents) {
            try {
                students = JSON.parse(savedStudents);
                sortStudents();
            } catch (e) {
                console.error("Error al cargar alumnos desde localStorage:", e);
                students = [];
            }
        }

        const savedGroup = localStorage.getItem('cbtis_active_group');
        if (savedGroup) {
            groupInput.value = savedGroup;
        } else {
            groupInput.value = '';
        }

        // Cargar asistencia desde LocalStorage
        const savedAttStudents = localStorage.getItem('cbtis_attendance_students');
        if (savedAttStudents) {
            try {
                attendanceStudents = JSON.parse(savedAttStudents);
            } catch (e) {
                console.error("Error al cargar alumnos de asistencia:", e);
                attendanceStudents = [];
            }
        }

        const savedAttHistory = localStorage.getItem('cbtis_attendance_history');
        if (savedAttHistory) {
            try {
                attendanceHistory = JSON.parse(savedAttHistory);
            } catch (e) {
                console.error("Error al cargar historial de asistencia:", e);
                attendanceHistory = {};
            }
        }

        // Fecha de asistencia por defecto a hoy (local)
        const localToday = new Date();
        const year = localToday.getFullYear();
        const month = String(localToday.getMonth() + 1).padStart(2, '0');
        const day = String(localToday.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        if (attDateInput) {
            attDateInput.value = todayStr;
        }

        // Establecer fecha actual formateada en español
        setCurrentDate();

        // Configurar Event Listeners
        setupEventListeners();

        // Renderizar tablas por primera vez
        render();
        renderAttendance();

        showToast(
            '¡Bienvenido!', 
            `Sistema iniciado. ${students.length} alumnos registrados.`, 
            'info'
        );
    }

    // --- MANEJO DE FECHA ---
    function setCurrentDate() {
        const today = new Date();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        // Formato DD/MM/AAAA
        currentDateSpan.textContent = today.toLocaleDateString('es-MX', options);
    }


    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Registro de Alumnos
        registrationForm.addEventListener('submit', handleRegistrationSubmit);

        // Validación en tiempo real al escribir o perder el foco
        [paternalInput, maternalInput, firstNameInput, emailInput].forEach(input => {
            input.addEventListener('input', () => validateField(input));
            input.addEventListener('blur', () => validateField(input));
        });

        groupInput.addEventListener('input', () => {
            validateField(groupInput);
            localStorage.setItem('cbtis_active_group', groupInput.value);
        });
        groupInput.addEventListener('blur', () => {
            validateField(groupInput);
            const capitalized = groupInput.value.toUpperCase().trim();
            groupInput.value = capitalized;
            localStorage.setItem('cbtis_active_group', capitalized);
        });

        // Barra de Búsqueda
        searchInput.addEventListener('input', handleSearch);
        clearSearchBtn.addEventListener('click', handleClearSearch);

        // Exportación CSV
        exportCsvBtn.addEventListener('click', exportToCSV);

        // Control del Modal de Edición
        editModalCloseBtn.addEventListener('click', closeEditModal);
        editModalCancelBtn.addEventListener('click', closeEditModal);
        editModalConfirmBtn.addEventListener('click', saveStudentEdit);

        // Control del Modal de Eliminación
        deleteModalCloseBtn.addEventListener('click', closeDeleteModal);
        deleteModalCancelBtn.addEventListener('click', closeDeleteModal);
        deleteModalConfirmBtn.addEventListener('click', confirmDelete);

        // Control del Modal de Limpieza
        btnClearTable.addEventListener('click', openClearModal);
        clearModalCloseBtn.addEventListener('click', closeClearModal);
        clearModalCancelBtn.addEventListener('click', closeClearModal);
        clearModalConfirmBtn.addEventListener('click', confirmClearTable);

        // Control del Modal de QR
        if (qrModalCloseBtn) qrModalCloseBtn.addEventListener('click', closeQRCodeModal);
        if (qrModalDownloadBtn) qrModalDownloadBtn.addEventListener('click', downloadQRCode);
        if (qrModalPrintBtn) qrModalPrintBtn.addEventListener('click', printQRCode);

        // Cerrar modales al hacer clic fuera del card
        window.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
            if (e.target === deleteModal) closeDeleteModal();
            if (e.target === confirmClearModal) closeClearModal();
            if (e.target === qrModal) closeQRCodeModal();
        });

        // --- EVENT LISTENERS DE ASISTENCIA ---
        // Pestañas
        setupTabs();

        // Importación/Carga de alumnos
        btnImportFromRegistry.addEventListener('click', importFromRegistry);
        btnUploadCsvTrigger.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', handleCSVUpload);

        // Respaldo
        btnExportHistory.addEventListener('click', exportAttendanceHistory);
        btnImportHistoryTrigger.addEventListener('click', () => importHistoryFile.click());
        importHistoryFile.addEventListener('change', handleImportHistory);

        // Búsqueda y fecha
        attSearchInput.addEventListener('input', handleAttendanceSearch);
        attClearSearchBtn.addEventListener('click', handleAttendanceClearSearch);
        attDateInput.addEventListener('change', () => renderAttendance());
    }


    // --- VALIDACIONES DE FORMULARIO ---
    function validateField(input) {
        const parent = input.parentElement;
        const value = input.value.trim();
        const errorSpan = parent.querySelector('.error-message');

        if (value === '') {
            parent.classList.remove('success');
            parent.classList.add('error');
            if (errorSpan) {
                errorSpan.textContent = 'Este campo es requerido.';
            }
            return false;
        }

        // Validación específica para correo electrónico
        if (input.type === 'email' || input.id === 'email-input' || input.id === 'edit-email') {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(value)) {
                parent.classList.remove('success');
                parent.classList.add('error');
                if (errorSpan) {
                    errorSpan.textContent = 'Introduce un formato de correo válido.';
                }
                return false;
            }
        }

        parent.classList.remove('error');
        parent.classList.add('success');
        return true;
    }

    function validateForm() {
        const isGroupValid = validateField(groupInput);
        const isPaternalValid = validateField(paternalInput);
        const isMaternalValid = validateField(maternalInput);
        const isNameValid = validateField(firstNameInput);
        const isEmailValid = validateField(emailInput);

        return isGroupValid && isPaternalValid && isMaternalValid && isNameValid && isEmailValid;
    }

    function clearFormValidationStyles() {
        [paternalInput, maternalInput, firstNameInput, emailInput].forEach(input => {
            const parent = input.parentElement;
            parent.classList.remove('success', 'error');
        });
    }


    // --- OPERACIONES CRUD ---

    // 1. Crear Alumno
    function handleRegistrationSubmit(e) {
        e.preventDefault();

        // Validar campos
        if (!validateForm()) {
            showToast('Formulario Incompleto', 'Por favor, llena todos los campos obligatorios.', 'warning');
            return;
        }

        // Obtener y formatear datos (Capitalización de nombres)
        const group = groupInput.value.toUpperCase().trim();
        const paternal = capitalizeText(paternalInput.value);
        const maternal = capitalizeText(maternalInput.value);
        const firstName = capitalizeText(firstNameInput.value);
        const email = emailInput.value.trim().toLowerCase();

        // Verificar si ya existe un alumno con el mismo nombre y apellidos
        const isDuplicate = students.some(student => 
            student.firstName.toLowerCase().trim() === firstName.toLowerCase().trim() &&
            student.paternalLastName.toLowerCase().trim() === paternal.toLowerCase().trim() &&
            student.maternalLastName.toLowerCase().trim() === maternal.toLowerCase().trim()
        );

        if (isDuplicate) {
            showToast(
                'Registro Duplicado', 
                `El alumno "${firstName} ${paternal} ${maternal}" ya se encuentra registrado.`, 
                'warning'
            );
            return;
        }

        // Generar ID único oculto para el registro (ej. ALU-2026-LX8K2M)
        const uniqueId = `ALU-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

        // Crear objeto de alumno
        const newStudent = {
            id: uniqueId,
            group: group,
            paternalLastName: paternal,
            maternalLastName: maternal,
            firstName: firstName,
            email: email
        };

        // Agregar al estado e indexar
        students.push(newStudent);
        sortStudents();
        saveToLocalStorage();

        // Renderizar con animación especial para la nueva fila
        render(newStudent.id);

        // Limpiar solo los campos de alumno, no el grupo
        paternalInput.value = '';
        maternalInput.value = '';
        firstNameInput.value = '';
        emailInput.value = '';
        clearFormValidationStyles();

        // Notificación de Éxito
        showToast(
            'Alumno Registrado', 
            `${firstName} ${paternal} ha sido agregado correctamente.`, 
            'success'
        );

        // Generar y mostrar el Código QR del nuevo alumno
        showQRCodeModal(newStudent);
    }

    // Guardar cambios persistentes
    function saveToLocalStorage() {
        localStorage.setItem('cbtis_students', JSON.stringify(students));
    }


    // --- SISTEMA DE RENDERIZADO Y VISTAS ---
    function render(highlightId = null) {
        // 1. Filtrar los alumnos según la barra de búsqueda
        const filteredStudents = students.filter(student => {
            const query = currentFilter.toLowerCase().trim();
            if (query === '') return true;

            const fullName = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`.toLowerCase();
            const alternateFullName = `${student.paternalLastName} ${student.maternalLastName} ${student.firstName}`.toLowerCase();
            const email = (student.email || '').toLowerCase();

            return fullName.includes(query) || alternateFullName.includes(query) || email.includes(query);
        });

        // 2. Controlar la visibilidad de los estados vacíos
        if (students.length === 0) {
            // No hay alumnos registrados en absoluto
            emptyStateView.style.display = 'flex';
            noResultsView.style.display = 'none';
            studentsTable.style.display = 'none';
            exportCsvBtn.disabled = true;
        } else if (filteredStudents.length === 0) {
            // Hay alumnos pero ninguno coincide con la búsqueda
            emptyStateView.style.display = 'none';
            noResultsView.style.display = 'flex';
            studentsTable.style.display = 'none';
            exportCsvBtn.disabled = true;
        } else {
            // Hay alumnos que coinciden con los filtros
            emptyStateView.style.display = 'none';
            noResultsView.style.display = 'none';
            studentsTable.style.display = 'table';
            exportCsvBtn.disabled = false;
        }

        // 3. Renderizar filas de la tabla
        studentsTableBody.innerHTML = '';
        
        filteredStudents.forEach((student, index) => {
            const row = document.createElement('tr');
            row.id = `row-${student.id}`;

            // Si es un nuevo alumno recién agregado, añadir clase de animación
            if (highlightId && student.id === highlightId) {
                row.classList.add('row-new');
            }

            row.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td>${escapeHTML(student.paternalLastName)}</td>
                <td>${escapeHTML(student.maternalLastName)}</td>
                <td>${escapeHTML(student.firstName)}</td>
                <td>${escapeHTML(student.email || '-')}</td>
                <td class="col-actions">
                    <div class="action-buttons">
                        <button 
                            class="btn-action btn-qr-row" 
                            data-id="${student.id}" 
                            title="Ver Código QR"
                            aria-label="Ver QR de ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-qrcode"></i>
                        </button>
                        <button 
                            class="btn-action btn-edit-row" 
                            data-id="${student.id}" 
                            title="Editar Alumno"
                            aria-label="Editar ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button 
                            class="btn-action btn-delete-row" 
                            data-id="${student.id}" 
                            title="Eliminar Alumno"
                            aria-label="Eliminar ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            studentsTableBody.appendChild(row);
        });

        // Registrar dinámicamente eventos para botones de acciones en la tabla
        document.querySelectorAll('.btn-qr-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.getAttribute('data-id');
                const targetStudent = students.find(s => s.id === studentId);
                if (targetStudent) {
                    showQRCodeModal(targetStudent);
                }
            });
        });

        document.querySelectorAll('.btn-edit-row').forEach(btn => {
            btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-id')));
        });

        document.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', () => openDeleteModal(btn.getAttribute('data-id')));
        });

        // 4. Actualizar contadores
        totalCountSpan.textContent = students.length;
    }


    // --- MANEJO DE BÚSQUEDA ---
    function handleSearch(e) {
        currentFilter = e.target.value;
        
        // Mostrar u ocultar botón de limpiar búsqueda
        if (currentFilter.length > 0) {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }

        render();
    }

    function handleClearSearch() {
        searchInput.value = '';
        currentFilter = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        render();
    }


    // --- MODAL DE EDICIÓN ---
    function openEditModal(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        studentToEditId = id;

        // Construir contenido dinámico del formulario de edición dentro del modal
        editModalBody.innerHTML = `
            <div class="form-modal-edit" style="display: flex; flex-direction: column; gap: 1.2rem;">
                <div class="input-group">
                    <label for="edit-paternal-name">
                        <i class="fa-solid fa-signature input-icon"></i> Apellido Paterno
                    </label>
                    <input type="text" id="edit-paternal-name" value="${escapeHTML(student.paternalLastName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-maternal-name">
                        <i class="fa-solid fa-signature input-icon"></i> Apellido Materno
                    </label>
                    <input type="text" id="edit-maternal-name" value="${escapeHTML(student.maternalLastName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-first-name">
                        <i class="fa-solid fa-user input-icon"></i> Nombre(s)
                    </label>
                    <input type="text" id="edit-first-name" value="${escapeHTML(student.firstName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-email">
                        <i class="fa-solid fa-envelope input-icon"></i> Correo Electrónico
                    </label>
                    <input type="email" id="edit-email" value="${escapeHTML(student.email || '')}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
            </div>
        `;

        // Añadir escuchas de validación a campos de edición
        const editPaternal = document.getElementById('edit-paternal-name');
        const editMaternal = document.getElementById('edit-maternal-name');
        const editFirstName = document.getElementById('edit-first-name');
        const editEmail = document.getElementById('edit-email');

        [editPaternal, editMaternal, editFirstName, editEmail].forEach(input => {
            input.addEventListener('input', () => validateField(input));
        });

        // Mostrar modal agregando clase active
        editModal.classList.add('active');
        editModal.setAttribute('aria-hidden', 'false');
        editPaternal.focus();
    }

    function closeEditModal() {
        editModal.classList.remove('active');
        editModal.setAttribute('aria-hidden', 'true');
        studentToEditId = null;
    }

    function saveStudentEdit() {
        if (!studentToEditId) return;

        const editPaternal = document.getElementById('edit-paternal-name');
        const editMaternal = document.getElementById('edit-maternal-name');
        const editFirstName = document.getElementById('edit-first-name');
        const editEmail = document.getElementById('edit-email');

        // Validar campos en el modal
        const isPaternalValid = validateField(editPaternal);
        const isMaternalValid = validateField(editMaternal);
        const isNameValid = validateField(editFirstName);
        const isEmailValid = validateField(editEmail);

        if (!isPaternalValid || !isMaternalValid || !isNameValid || !isEmailValid) {
            showToast('Formulario Incompleto', 'Por favor, llena todos los campos en la edición.', 'warning');
            return;
        }

        // Encontrar e indexar estudiante
        const index = students.findIndex(s => s.id === studentToEditId);
        if (index !== -1) {
            const formattedPaternal = capitalizeText(editPaternal.value);
            const formattedMaternal = capitalizeText(editMaternal.value);
            const formattedName = capitalizeText(editFirstName.value);
            const formattedEmail = editEmail.value.trim().toLowerCase();

            // Verificar si el nuevo nombre es un duplicado de otro alumno
            const isDuplicate = students.some(student => 
                student.id !== studentToEditId &&
                student.firstName.toLowerCase().trim() === formattedName.toLowerCase().trim() &&
                student.paternalLastName.toLowerCase().trim() === formattedPaternal.toLowerCase().trim() &&
                student.maternalLastName.toLowerCase().trim() === formattedMaternal.toLowerCase().trim()
            );

            if (isDuplicate) {
                showToast(
                    'Registro Duplicado', 
                    `El alumno "${formattedName} ${formattedPaternal} ${formattedMaternal}" ya se encuentra registrado.`, 
                    'warning'
                );
                return;
            }

            students[index] = {
                ...students[index],
                paternalLastName: formattedPaternal,
                maternalLastName: formattedMaternal,
                firstName: formattedName,
                email: formattedEmail
            };

            sortStudents();
            saveToLocalStorage();
            render();
            closeEditModal();

            showToast(
                'Datos Actualizados', 
                `Se guardaron los cambios para ${formattedName} ${formattedPaternal}.`, 
                'success'
            );
        }
    }


    // --- MODAL DE ELIMINACIÓN ---
    function openDeleteModal(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        studentToDeleteId = id;
        deleteStudentNameSpan.textContent = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`;

        deleteModal.classList.add('active');
        deleteModal.setAttribute('aria-hidden', 'false');
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('active');
        deleteModal.setAttribute('aria-hidden', 'true');
        studentToDeleteId = null;
    }

    function confirmDelete() {
        if (!studentToDeleteId) return;

        const targetId = studentToDeleteId;
        const student = students.find(s => s.id === targetId);
        const studentName = student ? `${student.firstName} ${student.paternalLastName}` : 'El alumno';
        
        const row = document.getElementById(`row-${targetId}`);
        
        // Cerrar modal inmediatamente
        closeDeleteModal();

        // Si la fila está en el render actual, ejecutar animación de salida antes de remover del DOM
        if (row) {
            row.classList.add('row-delete');
            // Esperar a que acabe la animación (300ms)
            setTimeout(() => {
                executeDeletion(targetId, studentName);
            }, 300);
        } else {
            executeDeletion(targetId, studentName);
        }
    }

    function executeDeletion(id, name) {
        students = students.filter(s => s.id !== id);
        saveToLocalStorage();
        render();

        showToast(
            'Registro Eliminado', 
            `${name} ha sido removido del sistema.`, 
            'danger'
        );
    }

    // --- MODAL DE LIMPIEZA DE TABLA ---
    function openClearModal() {
        if (students.length === 0) {
            showToast('Tabla ya Vacía', 'No hay registros en pantalla para limpiar.', 'info');
            return;
        }
        confirmClearModal.classList.add('active');
        confirmClearModal.setAttribute('aria-hidden', 'false');
    }

    function closeClearModal() {
        confirmClearModal.classList.remove('active');
        confirmClearModal.setAttribute('aria-hidden', 'true');
    }

    function confirmClearTable() {
        closeClearModal();
        
        // Animación de salida a todas las filas antes de vaciar
        const rows = document.querySelectorAll('#students-table-body tr');
        if (rows.length > 0) {
            rows.forEach(row => {
                row.classList.add('row-delete');
            });
            
            // Esperar que acabe la animación (300ms)
            setTimeout(() => {
                executeClearTable();
            }, 300);
        } else {
            executeClearTable();
        }
    }

    function executeClearTable() {
        students = [];
        saveToLocalStorage();
        
        // Limpiar inputs del formulario y sus validaciones
        registrationForm.reset();
        clearFormValidationStyles();
        
        render();

        showToast(
            'Pantalla Limpiada',
            'Se han borrado los registros de la pantalla. Listo para iniciar un nuevo grupo.',
            'info'
        );
    }

    // --- MODAL Y GENERACIÓN DE CÓDIGO QR ---
    function showQRCodeModal(student) {
        if (!student) return;
        currentQRStudent = student;

        const fullName = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`;
        if (qrStudentName) qrStudentName.textContent = fullName;
        if (qrStudentGroup) qrStudentGroup.innerHTML = `<i class="fa-solid fa-users-rectangle"></i> Grupo: <strong>${escapeHTML(student.group)}</strong>`;
        if (qrStudentEmail) qrStudentEmail.innerHTML = `<i class="fa-solid fa-envelope"></i> Correo: <strong>${escapeHTML(student.email || 'N/A')}</strong>`;

        if (qrCodeContainer) {
            qrCodeContainer.innerHTML = '';

            const qrData = JSON.stringify({
                escuela: "CBTis 111",
                id: student.id,
                nombre: fullName,
                grupo: student.group,
                correo: student.email
            });

            if (typeof QRCode !== 'undefined') {
                new QRCode(qrCodeContainer, {
                    text: qrData,
                    width: 180,
                    height: 180,
                    colorDark: "#0F172A",
                    colorLight: "#FFFFFF",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else {
                const img = document.createElement('img');
                img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;
                img.alt = `QR ${student.firstName}`;
                qrCodeContainer.appendChild(img);
            }
        }

        if (qrModal) {
            qrModal.classList.add('active');
            qrModal.setAttribute('aria-hidden', 'false');
        }
    }

    function closeQRCodeModal() {
        if (qrModal) {
            qrModal.classList.remove('active');
            qrModal.setAttribute('aria-hidden', 'true');
        }
        currentQRStudent = null;
    }

    function downloadQRCode() {
        if (!currentQRStudent || !qrCodeContainer) return;

        const qrCanvas = qrCodeContainer.querySelector('canvas');
        const qrImg = qrCodeContainer.querySelector('img');

        let imageSrc = '';
        if (qrCanvas) {
            imageSrc = qrCanvas.toDataURL('image/png');
        } else if (qrImg) {
            imageSrc = qrImg.src;
        }

        if (!imageSrc) {
            showToast('Error', 'No se pudo generar la imagen del código QR.', 'danger');
            return;
        }

        const link = document.createElement('a');
        const fileName = `QR_${currentQRStudent.paternalLastName}_${currentQRStudent.firstName}_${currentQRStudent.group}.png`
            .replace(/\s+/g, '_');
        link.download = fileName;
        link.href = imageSrc;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('QR Descargado', `Se ha guardado la imagen QR de ${currentQRStudent.firstName}.`, 'success');
    }

    function printQRCode() {
        window.print();
    }



    // --- EXPORTAR A CSV (UTF-8 con BOM para soporte Excel) ---
    function exportToCSV() {
        if (students.length === 0) {
            showToast('Exportación Fallida', 'No hay alumnos registrados para exportar.', 'warning');
            return;
        }

        const rawGroup = groupInput.value.trim();
        if (rawGroup === '') {
            showToast('Grupo Requerido', 'Por favor, escribe el grupo en el formulario para nombrar el archivo.', 'warning');
            validateField(groupInput);
            groupInput.focus();
            return;
        }

        const safeGroup = rawGroup
            .replace(/[\/\\?%*:|"<>.]/g, '')
            .replace(/\s+/g, '_');

        // Cabecera del archivo CSV con el ID Único del alumno
        let csvContent = `Grupo Escolar: ${rawGroup}\nNº,ID Alumno,Apellido Paterno,Apellido Materno,Nombre(s),Correo Electrónico\n`;

        // Mapeo y formateo de filas
        students.forEach((student, index) => {
            const num = index + 1;
            
            // Sanitizar valores (escapar comillas dobles y englobar entre comillas si es necesario)
            const studentId = escapeCSVField(student.id || '');
            const paternal = escapeCSVField(student.paternalLastName);
            const maternal = escapeCSVField(student.maternalLastName);
            const name = escapeCSVField(student.firstName);
            const email = escapeCSVField(student.email || '');

            csvContent += `${num},${studentId},${paternal},${maternal},${name},${email}\n`;
        });

        // Agregar la marca de orden de bytes (BOM) UTF-8 (\uFEFF) para que Excel reconozca la codificación automáticamente
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Crear elemento de descarga oculto
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);

            // Nombre del archivo con formato: alumnos_cbtis_Grupo_AAAA-MM-DD.csv
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            link.setAttribute("download", `alumnos_cbtis_${safeGroup}_${dateStr}.csv`);
            
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast(
                'Exportación Exitosa', 
                `Se ha descargado el archivo CSV con ${students.length} registros.`, 
                'success'
            );
        } else {
            showToast('Error', 'Tu navegador no soporta la descarga de archivos directa.', 'danger');
        }
    }


    // --- SISTEMA DE TOAST NOTIFICATIONS ---
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Selección de iconos por tipo
        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'danger') iconClass = 'fa-solid fa-triangle-exclamation';
        if (type === 'warning') iconClass = 'fa-solid fa-circle-exclamation';

        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <div class="toast-content">
                <h4 class="toast-title">${title}</h4>
                <p class="toast-message">${message}</p>
            </div>
            <button class="toast-close" aria-label="Cerrar notificación">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="toast-progress"></div>
        `;

        // Evento botón cerrar
        toast.querySelector('.toast-close').addEventListener('click', () => {
            dismissToast(toast);
        });

        // Agregar al contenedor
        toastContainer.appendChild(toast);

        // Auto-eliminar después de 4 segundos
        setTimeout(() => {
            dismissToast(toast);
        }, 4000);
    }

    function dismissToast(toast) {
        if (!toast.parentNode) return;
        toast.style.animation = 'toastOut 0.3s ease forwards';
        // Esperar a que acabe la animación de salida
        setTimeout(() => {
            if (toast.parentNode) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }


    // --- AYUDANTES Y UTILIDADES (UTILITIES) ---

    /**
     * Capitaliza la primera letra de cada palabra de una cadena y limpia espacios innecesarios.
     * Ejemplo: "  césar   ramón  " -> "César Ramón"
     */
    function capitalizeText(str) {
        if (!str) return '';
        return str
            .trim()
            .split(/\s+/)
            .map(word => {
                if (word.length === 0) return '';
                // Soporta acentos y la letra Ñ adecuadamente al capitalizar
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    }

    /**
     * Escapa caracteres de campo CSV si contienen comillas, comas o saltos de línea.
     */
    function escapeCSVField(val) {
        let stringVal = val ? val.toString() : '';
        // Si contiene comillas dobles, duplicarlas para escapar según estándar CSV
        if (stringVal.includes('"')) {
            stringVal = stringVal.replace(/"/g, '""');
        }
        // Si contiene comas, comillas o saltos de línea, envolver el campo en comillas dobles
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
            stringVal = `"${stringVal}"`;
        }
        return stringVal;
    }

    /**
     * Sanitiza entrada HTML para evitar vulnerabilidades XSS
     */
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Ordena la lista de alumnos alfabéticamente de la A a la Z.
     * Criterio: Apellido Paterno -> Apellido Materno -> Nombre(s)
     * Utiliza la configuración regional en español ('es') para manejar acentos y la letra Ñ correctamente.
     */
    function sortStudents() {
        students.sort((a, b) => {
            let cmp = a.paternalLastName.localeCompare(b.paternalLastName, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            
            cmp = a.maternalLastName.localeCompare(b.maternalLastName, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            
            return a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' });
        });
    }

    // --- FUNCIONES Y LÓGICA DE ASISTENCIA ---

    function setupTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab === 'registro') {
                    viewRegistro.style.display = 'grid';
                    viewAsistencia.style.display = 'none';
                } else {
                    viewRegistro.style.display = 'none';
                    viewAsistencia.style.display = 'grid';
                    renderAttendance();
                }
            });
        });
    }

    function importFromRegistry() {
        if (students.length === 0) {
            showToast('Importación Vacía', 'No hay alumnos registrados en el sistema para importar.', 'warning');
            return;
        }

        // Mapear y asignar a alumnos de asistencia
        attendanceStudents = students.map(student => ({
            id: student.id,
            name: `${student.paternalLastName} ${student.maternalLastName} ${student.firstName}`,
            email: student.email || ''
        }));

        // Ordenar alfabéticamente
        attendanceStudents.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        saveAttendanceToLocalStorage();
        renderAttendance();

        showToast('Importación Exitosa', `Se han importado ${attendanceStudents.length} alumnos desde el registro.`, 'success');
    }

    function handleCSVUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const text = evt.target.result;
            const parsed = parseCSV(text);
            if (parsed.length === 0) {
                showToast('Error de Carga', 'No se pudieron extraer alumnos del archivo CSV. Asegúrate del formato.', 'danger');
                return;
            }

            attendanceStudents = parsed;
            saveAttendanceToLocalStorage();
            renderAttendance();

            showToast('Carga de CSV Exitosa', `Se han cargado ${attendanceStudents.length} alumnos desde el archivo CSV.`, 'success');
            csvFileInput.value = '';
        };
        reader.onerror = function() {
            showToast('Error', 'No se pudo leer el archivo CSV.', 'danger');
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseCSV(text) {
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length === 0) return [];

        let parsedStudents = [];
        let hasHeader = false;

        const firstLine = lines[0].toLowerCase();
        if (firstLine.includes('nombre') || firstLine.includes('apellido') || firstLine.includes('email') || firstLine.includes('correo') || firstLine.includes('nº')) {
            hasHeader = true;
        }

        const startIndex = hasHeader ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            const columns = splitCSVLine(line);

            if (columns.length === 0) continue;

            let name = '';
            let email = '';

            if (columns.length === 1) {
                name = columns[0];
            } else if (columns.length === 2) {
                name = columns[0];
                email = columns[1];
            } else if (columns.length >= 3) {
                if (columns.length >= 4) {
                    if (columns[3].includes('@')) {
                        name = `${columns[2]} ${columns[0]} ${columns[1]}`;
                        email = columns[3];
                    } else {
                        name = `${columns[0]} ${columns[1]} ${columns[2]}`;
                    }
                } else {
                    name = `${columns[2]} ${columns[0]} ${columns[1]}`;
                }
            }

            if (name) {
                parsedStudents.push({
                    id: 'att-' + Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                    name: capitalizeText(name),
                    email: email.trim().toLowerCase()
                });
            }
        }

        parsedStudents.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        return parsedStudents;
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

    function renderAttendance() {
        const date = attDateInput.value;
        if (!date) return;

        const filtered = attendanceStudents.filter(student => {
            const query = attendanceFilter.toLowerCase().trim();
            if (query === '') return true;
            return student.name.toLowerCase().includes(query) || student.email.toLowerCase().includes(query);
        });

        if (attendanceStudents.length === 0) {
            attEmptyState.style.display = 'flex';
            attNoResults.style.display = 'none';
            attTable.style.display = 'none';
        } else if (filtered.length === 0) {
            attEmptyState.style.display = 'none';
            attNoResults.style.display = 'flex';
            attTable.style.display = 'none';
        } else {
            attEmptyState.style.display = 'none';
            attNoResults.style.display = 'none';
            attTable.style.display = 'table';
        }

        if (!attendanceHistory[date]) {
            attendanceHistory[date] = {};
        }
        const dayRecords = attendanceHistory[date];

        attTableBody.innerHTML = '';
        filtered.forEach((student, index) => {
            if (!dayRecords[student.id]) {
                dayRecords[student.id] = 'present';
            }
            const status = dayRecords[student.id];

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td><strong style="color: var(--text-primary); font-weight: 500;">${escapeHTML(student.name)}</strong></td>
                <td>
                    <div class="attendance-options" data-student-id="${student.id}">
                        <button class="att-btn att-present ${status === 'present' ? 'active' : ''}" data-status="present" aria-label="Presente">
                            <i class="fa-solid fa-check"></i> Pres
                        </button>
                        <button class="att-btn att-absent ${status === 'absent' ? 'active' : ''}" data-status="absent" aria-label="Ausente">
                            <i class="fa-solid fa-xmark"></i> Aus
                        </button>
                    </div>
                </td>
            `;
            attTableBody.appendChild(row);
        });

        document.querySelectorAll('.attendance-options').forEach(group => {
            const studentId = group.getAttribute('data-student-id');
            group.querySelectorAll('.att-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const status = btn.getAttribute('data-status');
                    
                    group.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    attendanceHistory[date][studentId] = status;
                    
                    saveAttendanceToLocalStorage();
                    updateAttendanceStats();
                });
            });
        });

        updateAttendanceStats();
    }

    function updateAttendanceStats() {
        const date = attDateInput.value;
        if (!date || attendanceStudents.length === 0) {
            attStatTotal.textContent = '0';
            attStatPresent.textContent = '0';
            attStatAbsent.textContent = '0';
            attStatPercent.textContent = '0%';
            return;
        }

        const dayRecords = attendanceHistory[date] || {};
        let total = attendanceStudents.length;
        let present = 0;
        let absent = 0;

        attendanceStudents.forEach(student => {
            const status = dayRecords[student.id] || 'present';
            if (status === 'present') present++;
            else if (status === 'absent') absent++;
            else if (status === 'late') present++; // Consider 'late' as present in stats if it exists in old records
        });

        attStatTotal.textContent = total;
        attStatPresent.textContent = present;
        attStatAbsent.textContent = absent;

        const percent = total > 0 ? Math.round((present / total) * 100) : 0;
        attStatPercent.textContent = `${percent}%`;
    }

    function saveAttendanceToLocalStorage() {
        localStorage.setItem('cbtis_attendance_students', JSON.stringify(attendanceStudents));
        localStorage.setItem('cbtis_attendance_history', JSON.stringify(attendanceHistory));
    }

    function handleAttendanceSearch(e) {
        attendanceFilter = e.target.value;
        if (attendanceFilter.length > 0) {
            attClearSearchBtn.style.display = 'flex';
        } else {
            attClearSearchBtn.style.display = 'none';
        }
        renderAttendance();
    }

    function handleAttendanceClearSearch() {
        attSearchInput.value = '';
        attendanceFilter = '';
        attClearSearchBtn.style.display = 'none';
        attSearchInput.focus();
        renderAttendance();
    }

    function exportAttendanceHistory() {
        if (attendanceStudents.length === 0) {
            showToast('Exportación Fallida', 'No hay datos de alumnos para exportar.', 'warning');
            return;
        }

        const backupData = {
            students: attendanceStudents,
            history: attendanceHistory
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        
        link.setAttribute('href', url);
        link.setAttribute('download', `respaldo_asistencia_${dateStr}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Exportación Exitosa', 'El historial del semestre ha sido descargado en formato JSON.', 'success');
    }

    function handleImportHistory(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                if (!data.students || !data.history) {
                    showToast('Importación Fallida', 'El archivo no tiene el formato de respaldo correcto.', 'danger');
                    return;
                }

                attendanceStudents = data.students;
                attendanceHistory = data.history;

                saveAttendanceToLocalStorage();
                renderAttendance();

                showToast('Respaldo Restaurado', `Se importaron ${attendanceStudents.length} alumnos e historial con éxito.`, 'success');
            } catch (err) {
                showToast('Error', 'No se pudo procesar el archivo JSON de respaldo.', 'danger');
            }
            importHistoryFile.value = '';
        };
        reader.readAsText(file);
    }

    // --- EJECUTAR INICIO DE APP ---
    init();
});
