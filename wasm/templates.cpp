#include <stdint.h>

struct Text {
    const unsigned char *data;
    unsigned int length;
};

// Memoria de trabajo reutilizable; no aumenta el tamaño del archivo .wasm en 8 MB.
static const unsigned int capacity = 8 * 1024 * 1024;
static unsigned char buffer[capacity];
static unsigned int used = 0;
static unsigned int outputLength = 0;

extern "C" void reset_memory() {
    used = 0;
    outputLength = 0;
}

extern "C" unsigned int allocate(unsigned int length) {
    if (length > capacity - 7) return 0;

    unsigned int reserved = (length + 7) & ~7u;
    if (reserved == 0) reserved = 8;
    if (reserved > capacity - used) return 0;

    unsigned int address = (unsigned int)(uintptr_t)(buffer + used);
    used += reserved;
    return address;
}

extern "C" unsigned int result_length() {
    return outputLength;
}

static bool same_text(Text left, Text right) {
    if (left.length != right.length) return false;

    for (unsigned int index = 0; index < left.length; ++index) {
        if (left.data[index] != right.data[index]) return false;
    }

    return true;
}

// Cada registro recibido tiene la forma clave + US + valor + RS.
static bool find_value(Text records, Text key, Text &value) {
    unsigned int position = 0;

    while (position < records.length) {
        unsigned int start = position;
        while (position < records.length && records.data[position] != 31) {
            ++position;
        }
        if (position == records.length) return false;

        Text currentKey = { records.data + start, position - start };
        start = ++position;
        while (position < records.length && records.data[position] != 30) {
            ++position;
        }

        if (same_text(currentKey, key)) {
            value = { records.data + start, position - start };
            return true;
        }

        if (position < records.length) ++position;
    }

    return false;
}

static bool is_key_character(unsigned char character) {
    return (character >= 'a' && character <= 'z') ||
           (character >= 'A' && character <= 'Z') ||
           (character >= '0' && character <= '9') ||
           character == '_';
}

// Sin destino calcula el tamaño; con destino copia el HTML y sus sustituciones.
static int render_pass(Text source, Text records, unsigned char *destination) {
    unsigned int position = 0;
    unsigned int written = 0;

    while (position < source.length) {
        Text part = { source.data + position, 1 };
        unsigned int next = position + 1;

        if (position + 1 < source.length &&
            source.data[position] == '{' && source.data[position + 1] == '{') {
            unsigned int start = position + 2;
            unsigned int end = start;

            while (end < source.length && is_key_character(source.data[end])) {
                ++end;
            }

            if (end > start && end + 1 < source.length &&
                source.data[end] == '}' && source.data[end + 1] == '}') {
                Text key = { source.data + start, end - start };
                if (!find_value(records, key, part)) return -1;
                next = end + 2;
            }
        }

        if (part.length > capacity - written) return -2;

        if (destination) {
            for (unsigned int index = 0; index < part.length; ++index) {
                destination[written + index] = part.data[index];
            }
        }

        written += part.length;
        position = next;
    }

    return (int)written;
}

// Devuelve la dirección del HTML, -1 si falta un valor y -2 si falta memoria.
extern "C" int render_template(
    unsigned int templateAddress,
    unsigned int templateLength,
    unsigned int valuesAddress,
    unsigned int valuesLength
) {
    outputLength = 0;
    Text source = { (const unsigned char *)(uintptr_t)templateAddress, templateLength };
    Text records = { (const unsigned char *)(uintptr_t)valuesAddress, valuesLength };

    int length = render_pass(source, records, 0);
    if (length < 0) return length;

    unsigned int address = allocate((unsigned int)length);
    if (!address) return -2;

    int written = render_pass(source, records, (unsigned char *)(uintptr_t)address);
    if (written < 0) return written;

    outputLength = (unsigned int)written;
    return (int)address;
}
